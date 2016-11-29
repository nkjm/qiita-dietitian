// -----------------------------------------------------------------------------
// モジュールのインポート
var express = require('express');
var bodyParser = require('body-parser');
var mecab = require('mecabaas-client');
var shokuhin = require('shokuhin-db');
var memory = require('memory-cache');
var dietitian = require('./dietitian');
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
                    var botMemory = {
                        confirmedFoodList: [],
                        toConfirmFoodList: [],
                        confirmingFood: null
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
                            botMemory.toConfirmFoodList.push(nutritionList);
                        }
                    }

                    /*
                     * もし確認事項がなければ、合計カロリーを返信して終了。
                     * もし確認すべき食品があれば、質問して現在までの状態を記憶に保存。
                     */
                    if (botMemory.toConfirmFoodList.length == 0 && botMemory.confirmedFoodList.length > 0){
                        // 確認事項はないので、確定した食品のカロリーの合計を返信して終了。
                        dietitian.replyTotalCalorie(event.replyToken, botMemory.confirmedFoodList);
                    } else if (botMemory.toConfirmFoodList.length > 0){
                        // どの食品が正しいか確認する。
                        dietitian.askWhichFood(event.replyToken, botMemory.toConfirmFoodList[0]);

                        // 質問した食品は確認中のリストに入れ、質問リストからは削除。
                        botMemory.confirmingFood = botMemory.toConfirmFoodList[0];
                        botMemory.toConfirmFoodList.splice(0, 1);

                        // Botの記憶に保存
                        memory.put(event.source.userId, botMemory);
                    }
                }
            );
        } else if (event.type == 'postback'){
            // リクエストからデータを抽出。
            var answeredFood = JSON.parse(event.postback.data);

            // 記憶を取り出す。
            var botMemory = memory.get(event.source.userId);

            // 回答された食品を確定リストに追加
            botMemory.confirmedFoodList.push(answeredFood);

            /*
             * もし確認事項がなければ、合計カロリーを返信して終了。
             * もし確認すべき食品があれば、質問して現在までの状態を記憶に保存。
             */
            if (botMemory.toConfirmFoodList.length == 0 && botMemory.confirmedFoodList.length > 0){
                // 確認事項はないので、確定した食品のカロリーの合計を返信して終了。
                dietitian.replyTotalCalorie(event.replyToken, botMemory.confirmedFoodList);
            } else if (botMemory.toConfirmFoodList.length > 0){
                // どの食品が正しいか確認する。
                dietitian.askWhichFood(event.replyToken, botMemory.toConfirmFoodList[0]);

                // 質問した食品は確認中のリストに入れ、質問リストからは削除。
                botMemory.confirmingFood = botMemory.toConfirmFoodList[0];
                botMemory.toConfirmFoodList.splice(0, 1);

                // Botの記憶に保存
                memory.put(event.source.userId, botMemory);
            }
        }
    }
});
