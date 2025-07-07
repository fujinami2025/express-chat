const express = require('express')
const expressWs = require('express-ws')
//https://www.npmjs.com/package/@kobalab/majiang-core
const Majiang = require('@kobalab/majiang-core')

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
    /*
    players.forEach((player, index) => {
      if (player.readyState === 1) {
        player.send(JSON.stringify({ type: 'start', playerIndex: index, roomId }))
      }
    });
    */

    // 対戦開始処理
    startGame(roomId);
  }

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'dahai') {
      const room = rooms[data.roomId];
      if (!room) return;
      const playerIndex = data.playerIndex;
      const pai = data.pai;

      // 捨て牌の処理（room.handsなどを更新してもいい）
      const index = room.hands[playerIndex].indexOf(pai);
      if (index !== -1) {
        room.hands[playerIndex].splice(index, 1);
      }
      // 例えば捨て牌リストを作る場合はroom.discards[playerIndex] = [...];など管理

      // 他のプレイヤーに捨て牌を通知
      room.players.forEach((player, i) => {
        if (player !== ws && player.readyState === 1) {
          player.send(JSON.stringify({
            type: 'dahai',
            playerIndex,
            pai
          }));
        }
      });

      // ターン交代
      room.currentTurn = (room.currentTurn + 1) % 2;

      // ツモ（山から1枚引く）メッセージを次のプレイヤーに送る
      const nextPlayer = room.players[room.currentTurn];
      if (room.mountain.length > 0) {
        const nextPai = room.mountain.shift(); // 山から1枚引く
        room.hands[room.currentTurn].push(nextPai);
        room.hands[room.currentTurn].sort((a, b) => a - b);

        if (nextPlayer.readyState === 1) {
          nextPlayer.send(JSON.stringify({
            type: 'tsumo',
            pai: nextPai,
            hand: room.hands[room.currentTurn]
          }));
        }
      } else {
        // 山が無くなった場合は流局処理などをここで
      }
    }
  });

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
  let tiles = Array.from({ length: 136 }, (_, i) => i);
  shuffle(tiles);

  const hands = [
    tiles.slice(0, 13).sort((a, b) => a - b),     // プレイヤー1の手牌（昇順）
    tiles.slice(13, 26).sort((a, b) => a - b)     // プレイヤー2の手牌（昇順）
  ];

  const mountain = tiles.slice(26); // 配牌後の山牌を保持

  room.players.forEach((player, i) => {
    player.send(JSON.stringify({
      type: 'start',
      playerIndex: i,
      roomId,
      hand: hands[i]
    }));
  });

  room.hands = hands;
  room.mountain = mountain;
  room.currentTurn = 0;
  console.log('手牌:', hands);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}