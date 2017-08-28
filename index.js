"use strict";

const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const low = require('lowdb');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const socketIo = require('socket.io');

/** DATABASE SETUP **/
const DB = low('db.json');
const DEFAULT_DATA = require('./db.default.json');
DB._.mixin(require('lodash-id'));

DB.defaults(DEFAULT_DATA).write();

const app = express();
const server = require('http').Server(app);
const PORT = process.env.PORT || 3001;
const APP_SECRET = 'IHopeThisIsSecureEnough';

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(morgan('dev'));

app.use(function(req, res, next) {
    const token = req.headers['x-access-token'];

    if (token) {
        jwt.verify(token, APP_SECRET, function(err, decoded) {
            if (err) {
                return res.sendStatus(403);
            } else {
                req.user = DB.get('users').getById(decoded.id).omit('password').value();
                next();
            }
        });
    } else {
        next();
    }
});


/***
 * REST-ish API
 */
const API_PREFIX = '/api';

/**  /lists **/
app.get(`${API_PREFIX}/lists`, function (req, res) {
    const lists = DB.get('lists');
    res.send(lists);
});

app.get(`${API_PREFIX}/lists/:id`, function (req, res) {
    const list = DB.get('lists').getById(req.params.id).value();
    res.send(list);
});

app.put(`${API_PREFIX}/lists/:id`, function (req, res) {
    try {
        const list = DB.get('lists')
            .updateById(req.params.id, req.body)
            .write();

        broadcastAction({
            type: '[LISTS] UPDATE',
            payload: {
                id: req.params.id,
                updates: req.body
            }
        });

        res.send(list);
    } catch (e) {
        res.sendStatus(404);
    }
});

app.delete(`${API_PREFIX}/lists/:id`, function (req, res) {
    try {
        DB.get('lists')
            .removeById(req.params.id)
            .write();

        broadcastAction({
            type: '[LISTS] REMOVE',
            payload: req.params.id
        });

        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(404);
    }
});

app.post(`${API_PREFIX}/lists`, function (req, res) {
    const list = DB.get('lists')
        .insert(req.body)
        .write();

    broadcastAction({
        type: '[LISTS] CREATE',
        payload: { list }
    });

    res.send(list);
});

/** /cards **/
app.get(`${API_PREFIX}/cards`, function (req, res) {
    const cards = DB.get('cards');
    res.send(cards);
});

app.get(`${API_PREFIX}/cards/:id`, function (req, res) {
    const card = DB.get('cards').getById(req.params.id).value();
    res.send(card);
});

app.put(`${API_PREFIX}/cards/:id`, function (req, res) {
    try {
        const card = DB.get('cards')
            .updateById(req.params.id, req.body)
            .write();

        broadcastAction({
            type: '[CARDS] UPDATE',
            payload: {
                id: req.params.id,
                updates: req.body
            }
        });

        res.send(card);
    } catch (e) {
        res.sendStatus(404);
    }
});

app.delete(`${API_PREFIX}/cards/:id`, function (req, res) {
    try {
        DB.get('cards')
            .removeById(req.params.id)
            .write();

        broadcastAction({
            type: '[CARDS] REMOVE',
            payload: req.params.id
        });

        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(404);
    }
});

app.post(`${API_PREFIX}/cards`, function (req, res) {
console.log(JSON.stringify(req.body, null, 2));

    const card = DB.get('cards')
        .insert(req.body)
        .write();

    broadcastAction({
        type: '[CARDS] CREATE',
        payload: { card, listId: card.list_id }
    });

    res.send(card);
});

/** /users **/
app.get(`${API_PREFIX}/users`, function (req, res) {
    const users = DB.get('users').map(user => _.omit(user, 'password'));
    res.send(users);
});

app.put(`${API_PREFIX}/users`, function (req, res) {
    if (!req.user) {
        return res.sendStatus(403);
    }

    try {
        const user = DB.get('users')
            .updateById(req.user.id, req.body)
            .write();

        res.send(_.omit(user, 'password'));
    } catch (e) {
        res.sendStatus(404);
    }
});

app.delete(`${API_PREFIX}/users`, function (req, res) {
    if (!req.user) {
        return res.sendStatus(403);
    }

    try {
        DB.get('users')
            .removeById(req.user.id)
            .write();

        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(404);
    }
});

app.post(`${API_PREFIX}/users`, function (req, res) {
    const user = DB.get('users')
        .insert(req.body)
        .write();

    res.send(user);
});

/** authentication **/

app.post(`${API_PREFIX}/token`, function (req, res) {
    const {username, password} = req.body;
    const user = DB.get('users')
        .find({username, password})
        .value();

    if (!user) {
        return res.sendStatus(403);
    }

    const token = jwt.sign({ id: user.id }, APP_SECRET, {
        expiresIn: 1440
    });

    res.send({token});
});

app.get(`/api/me`, function(req, res) {
    res.send(req.user);
});


server.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}/`)
});

/***
 * SOCKETS
 */

const io = socketIo(server);
function broadcastAction(action) {
    io.sockets.emit('action', action);
}