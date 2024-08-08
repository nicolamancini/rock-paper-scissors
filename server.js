const PORT = process.env.PORT || 5000

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://gameland.altervista.org", // Specifica il dominio del tuo client
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true
    }
});

app.use(cors({
    origin: "https://gameland.altervista.org",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

//const server = require('express')();
//const http = require('http').createServer(server);
//io = require('socket.io')(http);

app.get("/", (req, res) => {
	res.json({ message: "Hello from backend 4"});
});


// Gestisci le richieste OPTIONS
app.options('*', cors());

let players = [];
let countRooms = 0;

var currentConnections = {};

io.on('connection', function (socket) {

    console.log('A user connected: ' + socket.id + ' socket.handshake.query.playerName ' + socket.handshake.query.playerName);

    var giocate = new Array(2);
    giocate[0]=new Array(2);
    giocate[1]=new Array(2);

    if (players.length === 1) {
        io.emit('isPlayerA');
    };

    socket.on('connect', function () {
        io.emit('connect');
    });

    socket.on('entro_in_room', function (nickname) {
      console.log("server: entra in room "+nickname);

      player = new Object();
      player.id = socket.id;
      player.name = nickname;

      // salviamo id e nome
      players.push(player);

      currentConnections[socket.id] = {nome: nickname};

      // invio a tutti la lista dei connessi
      socket.emit('entrato_in_room', players);
      socket.broadcast.emit('entrato_in_room', players);
    });


    socket.on('invito_gara', function (id) {
      // ricaviamo il nome di chi ha invitato
      // sending to individual socketid (private message)
      playerInvitante = new Object();
      playerInvitante.id = socket.id;
      playerInvitante.name = socket.handshake.query.playerName;

      // creaimo room
      socket.join(socket.id+'room');

      currentConnections[socket.id].room = socket.id+'room';

      io.to(id).emit('invitato_gara', playerInvitante);
      console.log("emit: invitato_gara da "+playerInvitante.name);

    });

    socket.on('invito_accettato', function (idInvitante) {
      console.log("server: invito_accettato da " + socket.id + " fatto da "+ idInvitante);

      socket.join(idInvitante+'room');

      io.to(idInvitante+'room').emit('inizio_gara', idInvitante);

      currentConnections[socket.id].room = idInvitante+'room';
      currentConnections[socket.id].idAvversario = idInvitante;
      currentConnections[socket.id].score = 0;

      // aagiorniamo il record de colui che ha invitato, mettendo il nome dell'idAvversario
      currentConnections[idInvitante].idAvversario = socket.id;
      currentConnections[idInvitante].score = 0;

      //io.to(socket.id).emit('inizio_gara', playerInvitante);
      //io.to(idInvitante).emit('inizio_gara', socket.id);

      //console.log('currentConnections ' + JSON.stringify(currentConnections));
    });


    socket.on('scelta_effettuata', function (giocata, idInvitante) {
      console.log("server: scelta_effettuata, la singola giocata vale "+ giocata + " idInvitante "+ idInvitante);
      // dobbiamo controlla se tutti i giocatori della room hanno giocato

      var clients = io.sockets.adapter.rooms[idInvitante+'room'].sockets;
      //var clients = io.sockets.adapter.rooms[socket.id+'room'];

      currentConnections[socket.id].giocata = giocata;

      var idAvversario = currentConnections[socket.id].idAvversario;

      var giocataAvversario = currentConnections[idAvversario].giocata;
      // se la giocata dell'avversario è diversa da null
      if (giocataAvversario) {
        var giocataPropria = currentConnections[socket.id].giocata;
        if (giocataAvversario == giocataPropria) {
          console.log(" ***  patta  ***");
          io.to(socket.id).emit('esito_gara', {result: 'draw', giocataAvversario: giocataAvversario});
          io.to(idAvversario).emit('esito_gara', {result: 'draw', giocataAvversario: giocataPropria});
        }
        else {
          // carta forbici sasso
          if (
            (giocataAvversario=='carta' && giocataPropria == 'sasso') ||
            (giocataAvversario=='forbici' && giocataPropria == 'carta') ||
            (giocataAvversario=='sasso' && giocataPropria == 'forbici')
          ) {

            console.log(" *** vince chi ha giocato per prima *** "+ currentConnections[idAvversario].nome + ' che incrementerà il suo punteggio ' + currentConnections[idAvversario].score);
            currentConnections[idAvversario].score = currentConnections[idAvversario].score + 1;
            io.to(socket.id).emit('esito_gara', {result: 'lose', giocataAvversario: giocataAvversario, score: currentConnections[socket.id].score, scoreAvversario: currentConnections[idAvversario].score});
            io.to(idAvversario).emit('esito_gara', {result: 'win', giocataAvversario: giocataPropria, score: currentConnections[idAvversario].score, scoreAvversario: currentConnections[socket.id].score});

          }
          else {
            console.log(" *** vince l'ultimo che ha giocato *** "+ currentConnections[socket.id].nome);
            currentConnections[socket.id].score = currentConnections[socket.id].score + 1;
            console.log('invio esito vittoria a '+socket.id+ ' con score suo '+ currentConnections[socket.id].score + ' e quello avvers. ' + currentConnections[idAvversario].score);
            io.to(socket.id).emit('esito_gara', {result: 'win', giocataAvversario: giocataAvversario, score: currentConnections[socket.id].score, scoreAvversario: currentConnections[idAvversario].score});

            console.log('invio esito sconfitta a '+idAvversario+ ' con score suo '+ currentConnections[idAvversario].score + ' e quello avvers. ' + currentConnections[socket.id].score);

            io.to(idAvversario).emit('esito_gara', {result: 'lose', giocataAvversario: giocataPropria, score: currentConnections[idAvversario].score, scoreAvversario: currentConnections[socket.id].score});
          }

        }
        // svuotiamo la giocata
        currentConnections[idAvversario].giocata = '';
        currentConnections[socket.id].giocata = '';
        //console.log('currentConnections ' + JSON.stringify(currentConnections));
      }
      // aspettiamo ancora la giocata dell'avversario
      else {
      }

      //for (var client in clients ) {

           //this is the socket of each client in the room.
           //var clientSocket = io.sockets.connected[clientId];

          // console.log('get conn data ' + currentConnections[socket.id].giocata);

           //you can do whatever you need with this
           //clientSocket.emit('new event', "Updates");

      //}

    });


    socket.on('disconnect', function () {
        console.log('A user disconnected: ' + socket.id);
        players = players.filter(rec => rec.id !== socket.id);
        console.log('connessi: ' + players.length);
    });
});

server.listen(PORT, function () {
    console.log(`Listening on ${server.address().port}`);
});
