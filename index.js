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
            var p = mecab.parse(event.message.text)
            .then(
                function(response){
                    var foodList = [];
                    for (var elem of response){
                        if (elem.length > 2 && elem[1] == '名詞'){
                            foodList.push(elem);
                        }
                    }
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
                }
            );
        }
    }
});
