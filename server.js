const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://xusaitong.github.io", "http://localhost:8000"],
        methods: ["GET", "POST"]
    }
});

// 存储游戏房间信息
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 创建或加入房间
    socket.on('joinRoom', (roomId) => {
        let room = rooms.get(roomId);
        
        if (!room) {
            // 创建新房间
            room = {
                players: [socket.id],
                currentPlayer: socket.id,
                board: Array(15).fill().map(() => Array(15).fill(null)),
                spectators: []
            };
            rooms.set(roomId, room);
            socket.join(roomId);
            socket.emit('gameState', { 
                role: 'player1',
                board: room.board,
                currentPlayer: room.currentPlayer,
                roomId: roomId
            });
        } else if (room.players.length === 1 && !room.players.includes(socket.id)) {
            // 加入已存在的房间作为玩家2
            room.players.push(socket.id);
            socket.join(roomId);
            socket.emit('gameState', {
                role: 'player2',
                board: room.board,
                currentPlayer: room.currentPlayer,
                roomId: roomId
            });
            // 通知房间内所有人游戏开始
            io.to(roomId).emit('gameStart', { players: room.players });
        } else {
            // 作为观众加入
            room.spectators.push(socket.id);
            socket.join(roomId);
            socket.emit('gameState', {
                role: 'spectator',
                board: room.board,
                currentPlayer: room.currentPlayer,
                roomId: roomId
            });
        }
    });

    // 处理移动
    socket.on('move', ({ roomId, row, col }) => {
        const room = rooms.get(roomId);
        if (!room || room.currentPlayer !== socket.id) return;

        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex === -1) return;

        if (!room.board[row][col]) {
            room.board[row][col] = playerIndex === 0 ? 'black' : 'white';
            room.currentPlayer = room.players[playerIndex === 0 ? 1 : 0];
            
            io.to(roomId).emit('updateBoard', {
                board: room.board,
                currentPlayer: room.currentPlayer,
                lastMove: { row, col, player: playerIndex === 0 ? 'black' : 'white' }
            });
        }
    });

    // 处理重新开始
    socket.on('restart', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players.includes(socket.id)) {
            room.board = Array(15).fill().map(() => Array(15).fill(null));
            room.currentPlayer = room.players[0];
            io.to(roomId).emit('gameRestart', {
                board: room.board,
                currentPlayer: room.currentPlayer
            });
        }
    });

    // 处理断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('playerLeft', { playerId: socket.id });
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                }
            } else {
                const spectatorIndex = room.spectators.indexOf(socket.id);
                if (spectatorIndex !== -1) {
                    room.spectators.splice(spectatorIndex, 1);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
