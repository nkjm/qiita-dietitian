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
                    var gotAllNutrition = [];
                    if (foodList.length > 0){
                        for (var food of foodList){
                            shokuhin.getNutrition(food[0])
                            .then(
                                function(nutritionList){
                                    if (nutritionList.length == 1){
                                        // この食品で正しいか確認する。
                                        var headers = {
                                            'Content-Type': 'application/json',
                                            'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
                                        }
                                        var body = {
                                            replyToken: event.replyToken,
                                            messages: [{
                                                type: 'template',
                                                altText: nutritionList[0].food_name + 'でよろしいですか？',
                                                template: {
                                                    type: 'confirm',
                                                    text: nutritionList[0].food_name + 'でよろしいですか？',
                                                    actions: [
                                                        { type: 'postback', label: 'はい', data: { answer: 'yes', nutrition: JSON.stringify(nutritionList[0])} },
                                                        { type: 'postback', label: 'いいえ', data: { answer: 'no'} }
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
                                                data: { answer: 'food', nutrition: JSON.stringify(nutrition) }
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
