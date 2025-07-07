const express = require('express')
const expressWs = require('express-ws')
//https://www.npmjs.com/package/@kobalab/majiang-core
const Majong = require('@kobalab/majiang-core')
/*メモ　使いそうなやつ
手牌を表す
const shoupai = Majiang.Shoupai.fromString('123m456p789s東東東發');
向聴数（あと何枚でテンパイか）を返す
const xiangting = Majiang.Util.xiangting(shoupai);
テンパイ時の待ち牌一覧を返す
const tingpai = Majiang.Util.tingpai(shoupai);
和了判定・役判定・符計算・得点算出を行う
const huleResult = Majiang.Util.hule({...});
*/

const app = express()
expressWs(app)

const port = process.env.PORT || 3001

app.use(express.static('public'))

// プレイヤー待機用
let waitingPlayers = []
let roomCounter = 1
let waitingCount = 0 // ログ出力用に明示
const rooms = {}
app.ws('/ws', (ws, req) => {
  console.log('🔌 新しいクライアントが接続しました')

  waitingPlayers.push(ws)
  waitingCount++
  console.log(`🧍 現在の待機人数: ${waitingCount}`)

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'dahai') {
      const room = rooms[data.roomId];
      const hand = room.hands[data.playerIndex];

      try {
        hand.dapai(data.pai); // 例: '5p' など

        // 全員に打牌を通知
        room.players.forEach((player) => {
          if (player.readyState === 1) {
            player.send(JSON.stringify({
              type: 'dahai',
              playerIndex: data.playerIndex,
              pai: data.pai
            }));
          }
        });

        // 次のプレイヤーのツモ処理
        room.currentTurn = (room.currentTurn + 1) % 2;
        const nextPlayer = room.currentTurn;
        const tsumoPai = room.shan.zimo();
        room.hands[nextPlayer] = room.hands[nextPlayer].zimo(tsumoPai);

        room.players[nextPlayer].send(JSON.stringify({
          type: 'start', // 再利用して表示用に使ってる
          playerIndex: nextPlayer,
          roomId: data.roomId,
          hand: room.hands[nextPlayer].toString()
        }));
      } catch (e) {
        console.error('打牌エラー:', e);
      }
    }
  });


  // 待機人数を通知（クライアント側で受信して表示に使える）
  waitingPlayers.forEach((player) => {
    if (player.readyState === 1) {
      player.send(JSON.stringify({ type: 'waiting', count: waitingPlayers.length }))
    }
  })

  // 2人揃ったらゲーム開始
  if (waitingPlayers.length >= 2) {
    const roomId = `room-${roomCounter++}`
    const players = waitingPlayers.splice(0, 2)
    waitingCount -= 2

    console.log(`🎮 ルーム作成: ${roomId} で 2人の対戦を開始します`)

    // ここでルーム情報を保存
    rooms[roomId] = {
      players
    };

    // 対戦開始メッセージ送信
    players.forEach((player, index) => {
      if (player.readyState === 1) {
        player.send(JSON.stringify({ type: 'start', playerIndex: index, roomId }))
      }
    });

    // 対戦開始処理
    startGame(roomId);
  }

  ws.on('close', () => {
    console.log('❌ クライアントが切断されました')
    waitingPlayers = waitingPlayers.filter((p) => p !== ws)
    waitingCount--
    console.log(`🧍 現在の待機人数: ${waitingCount}`)
  })
})

app.listen(port, () => {
  console.log(`🚀 サーバー起動中: http://localhost:${port}`)
})

function startGame(roomId) {
  const room = rooms[roomId];

  const shan = new Majong.Shan(); //山
  shan.kaiju(); //配牌の準備

  //let tiles = Array.from({ length: 136 }, (_, i) => i);
  //shuffle(tiles);

  const hands = [
    //tiles.slice(0, 13).sort((a, b) => a - b),     // プレイヤー1の手牌（昇順）
    //tiles.slice(13, 26).sort((a, b) => a - b)     // プレイヤー2の手牌（昇順）
  ];
  for (let i = 0; i < 2; i++) {
    let hand = new Majong.Shoupai();
    for (let j = 0; j < 13; j++) {
      hand = hand.zimo(shan.zimo()); //山からツモして手牌に追加
    }
    hands.push(hand);
  }

  room.players.forEach((player, i) => {
    player.send(JSON.stringify({
      type: 'start',
      playerIndex: i,
      roomId,
      hand: hands[i].toString() // "123m456p789s東東東" など
    }));
  });

  room.hands = hands;
  room.shan = shan;
  room.currentTurn = 0;
  console.log('手牌:', hands.map(h => h.toString()));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}