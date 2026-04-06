const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const Datastore = require('nedb-promises');
const bcrypt = require('bcrypt');

// Database setup (Gagawa ito ng .db files sa folder mo)
const db = {};
db.users = Datastore.create({ filename: 'users.db', autoload: true });
db.messages = Datastore.create({ filename: 'messages.db', autoload: true });

app.use(express.static('public'));
app.use(express.json());

let onlineUsers = {}; // { username: socketId }

io.on('connection', async (socket) => {
    console.log('New Connection:', socket.id);

    // --- REGISTER LOGIC ---
    socket.on('register', async (data) => {
        try {
            const existingUser = await db.users.findOne({ user: data.user });
            if (existingUser) {
                return socket.emit('register-fail', 'Username already taken, pre.');
            }

            // I-encrypt ang password para safe i-deploy
            const hashedPassword = await bcrypt.hash(data.pass, 10);
            await db.users.insert({ user: data.user, pass: hashedPassword });
            
            socket.emit('register-success');
        } catch (err) {
            socket.emit('register-fail', 'Server Error. Try again.');
        }
    });

    // --- LOGIN LOGIC ---
    socket.on('login', async (data) => {
        try {
            const user = await db.users.findOne({ user: data.user });
            if (user && await bcrypt.compare(data.pass, user.pass)) {
                socket.username = data.user;
                onlineUsers[data.user] = socket.id;

                socket.emit('login-success', data.user);
                
                // I-load ang huling 50 messages para hindi blanko ang chat pag-open
                const history = await db.messages.find({}).sort({ timestamp: 1 }).limit(50);
                socket.emit('load-history', history);

                io.emit('update-users', Object.keys(onlineUsers));
            } else {
                socket.emit('login-fail', 'Maling username o password, pre.');
            }
        } catch (err) {
            socket.emit('login-fail', 'Database Error.');
        }
    });

    // --- GLOBAL CHAT WITH SAVING ---
    socket.on('global-msg', async (msg) => {
        if (!socket.username) return;

        const msgData = { 
            user: socket.username, 
            text: msg, 
            timestamp: Date.now() 
        };

        // I-save sa database bago i-send
        await db.messages.insert(msgData);
        io.emit('global-msg', msgData);
    });

    // --- PRIVATE CHAT (Simple Logic) ---
    socket.on('private-msg', (data) => {
        const targetId = onlineUsers[data.to];
        if (targetId) {
            io.to(targetId).emit('private-msg', {
                from: socket.username,
                text: data.text
            });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit('update-users', Object.keys(onlineUsers));
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server Live at Port ${PORT}`));