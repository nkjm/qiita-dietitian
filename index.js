// -----------------------------------------------------------------------------
// 定数の設定
const LINE_CHANNEL_ACCESS_TOKEN = 'BfVeE9hrQON44TV3jC62dL79KB/657LJKj0NRVTLxfMJECniXokiUhNDJi7+euWci78Bax+KJUbDMqaWV9t/zMqcoDsj7XzTi4tWiLXvDg7Or2HWMEhMori47u18nOMl+eUbDkEL8Ru+aH74GNrSZgdB04t89/1O/w1cDnyilFU=';

// -----------------------------------------------------------------------------
// モジュールのインポート
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var mecab = require('mecabaas-client');
var shokuhin = require('shokuhin-db');
var memory = require('memory-cache');
var app = express();


// -----------------------------------------------------------------------------
// ミドルウェア設定
// リクエストのbodyをJSONとしてパースし、req.bodyからそのデータにアクセス可能にします。
app.use(bodyParser.json());

// -----------------------------------------------------------------------------
// Webサーバー設定
var port = (process.env.PORT || 3000);
var server = app.listen(port, function() {
    console.log('Node is running on port ' + port);
});


// -----------------------------------------------------------------------------
// ルーター設定
app.get('/', function(req, res, next){
    res.send('Node is running on port ' + port);
});

app.post('/webhook', function(req, res, next){
    res.status(200).end();
    for (var event of req.body.events){
        if (event.type == 'message' && event.message.text){
            mecab.parse(event.message.text)
            .then(
                function(response){
                    var foodList = [];
                    for (var elem of response){
                        if (elem.length > 2 && elem[1] == '名詞'){
                            foodList.push(elem);
                        }
                    }
                    var gotAllNutrition = [];
                    if (foodList.length > 0){
                        for (var food of foodList){
                            gotAllNutrition.push(shokuhin.getNutrition(food[0]));
                        }
                        return Promise.all(gotAllNutrition);
                    }
                }
            ).then(
                function(responseList){
                    console.log(responseList);
                    
                    var botMemory = {
                        confirmedFoodList: [],
                        toConfirmFoodList: []
                    }
                    for (var nutritionList of responseList){
                        if (nutritionList.length == 0){
                            // 少なくとも今回の食品DBでは食品と判断されなかったのでスキップ。
                            continue;
                        } else if (nutritionList.length == 1){
                            // 該当する食品が一つだけ見つかったのでこれで確定した食品リストに入れる。
                            botMemory.confirmedFoodList.push(nutritionList[0]);
                        } else if (nutritionList.length > 1){
                            // 複数の該当食品が見つかったのでユーザーに確認するリストに入れる。
                            botMemory.toConfirmFoodList.concat(nutritionList);
                        }
                    }

                    console.log(botMemory);

                    // Botの記憶に保存
                    memory.put(event.source.userId, botMemory);

                    if (botMemory.toConfirmFoodList.length == 0 && botMemory.confirmedFoodList.length > 0){
                        console.log('Going to reply the total calorie.');

                        // 確認事項はないので、確定した食品のカロリーの合計を返信して終了。
                        var foodListStr = "";
                        var totalCalorie = 0;
                        for (var food of botMemory.confirmedFoodList){
                            totalCalorie += food.calorie;
                        }

                        var headers = {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
                        }
                        var body = {
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: 'カロリーは合計' + totalCalorie + 'kcalです！'
                            }]
                        }
                        var url = 'https://api.line.me/v2/bot/message/reply';
                        request({
                            url: url,
                            method: 'POST',
                            headers: headers,
                            body: body,
                            json: true
                        });
                    } else if (botMemory.toConfirmFoodList.length > 0){
                        console.log('Going to ask which food the user had');

                        // どの食品が正しいか確認する。
                        var headers = {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
                        }
                        var body = {
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'template',
                                altText: 'どの食品が最も近いですか？',
                                template: {
                                    type: 'buttons',
                                    text: 'どの食品が最も近いですか？',
                                    actions: []
                                }
                            }]
                        }
                        for (var food of botMemory.toConfirmFoodList){
                            body.messages[0].template.actions.push({
                                type: 'postback',
                                label: food.food_name,
                                data: JSON.stringify({ answer: 'food', food: food })
                            });

                            // 現在Templateメッセージに付加できるactionは4つまでのため、5つ以上の候補はカット。
                            if (body.messages[0].template.actions.length == 4){
                                break;
                            }
                        }
                        var url = 'https://api.line.me/v2/bot/message/reply';
                        request({
                            url: url,
                            method: 'POST',
                            headers: headers,
                            body: body,
                            json: true
                        });
                    }
                }
            );
        }
    }
});

/*
if (foodList.length > 0){
    for (var food of foodList){
        console.log('Going to get nutrition of ' + food[0]);

        shokuhin.getNutrition(food[0])
        .then(
            function(nutritionList){
                if (nutritionList.length == 1){
                    console.log('Going to confirm if the food is ' + nutritionList[0].food_name);

                    // この食品で正しいか確認する。
                    var headers = {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
                    }
                    var body = {
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'template',
                            altText: nutritionList[0].food_name.trim() + 'で合ってますか？',
                            template: {
                                type: 'confirm',
                                text: nutritionList[0].food_name.trim() + 'で合ってますか？',
                                actions: [
                                    { type: 'postback', label: 'はい', data: JSON.stringify({ answer: 'yes', nutrition: nutritionList[0] }) },
                                    { type: 'postback', label: 'いいえ', data: JSON.stringify({ answer: 'no'}) }
                                ]
                            }
                        }]
                    }
                    var url = 'https://api.line.me/v2/bot/message/reply';
                    request({
                        url: url,
                        method: 'POST',
                        headers: headers,
                        body: body,
                        json: true
                    });
                } else if (nutritionList.length > 1){
                    console.log('Going to ask which food the user had');

                    // どの食品が正しいか確認する。
                    var headers = {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
                    }
                    var body = {
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'template',
                            altText: 'どの食品ですか？',
                            template: {
                                type: 'buttons',
                                text: 'どの食品ですか？',
                                actions: []
                            }
                        }]
                    }
                    for (var nutrition of nutritionList){
                        body.messages[0].template.actions.push({
                            type: 'postback',
                            label: nutrition.food_name,
                            data: JSON.stringify({ answer: 'food', nutrition: nutrition })
                        });
                        if (body.messages[0].template.actions.length == 4){
                            break;
                        }
                    }
                    var url = 'https://api.line.me/v2/bot/message/reply';
                    request({
                        url: url,
                        method: 'POST',
                        headers: headers,
                        body: body,
                        json: true
                    });
                }
            }
        )
    }
}
*/
