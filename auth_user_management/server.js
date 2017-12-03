var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var mongoose = require('mongoose');
var passport = require('passport');
var config = require('./config/database'); // get db config file
var User = require('./app/models/user'); // get the mongoose model
var port = process.env.PORT || 4200;

var jwt2 = require('jsonwebtoken');

var flash = require('connect-flash')
var destroy = require('destroy')
var Q = require("q");
// get the request parameters
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// log to the console
app.use(morgan('dev'));

// Use the passport package in our application
app.use(passport.initialize());

//  Route (GET http://localhost:4200)
app.get('/', function (req, res) {
  res.send(' The API is at http://localhost:' + port + '/api');
});

// connect to MONGODB using mongoose
mongoose.connect(config.database);

// passing the passport for configuration
require('./config/passport')(passport);

// bundle FOR MY API ROOT 
var apiRoutes = express.Router();
// create a new user account (POST http://localhost:4200/api/signup)
apiRoutes.post('/signup', function (req, res) {
  if (!req.body.name || !req.body.password) {
    res.status(400).json({success: false, msg: 'Please pass name and password.'});

  } else {
    var newUser = new User({
      name: req.body.name,
      password: req.body.password,
      status: 'nothing'
    });
    // save the user
    console.log('create new user: ' + newUser);

    newUser.save(function (err) {
      if (err) {
        res.status(409).json({success: false, msg: 'Username already exists'});
      }
      else {
        res.status(201).json({success: true, msg: 'Successful created new user.'});
      }
    });
  }
});

// route to log in a user (POST http://localhost:4200/api/login)
apiRoutes.post('/login', function (req, res) {
  User.findOne({
    name: req.body.name
  }, function (err, user) {
    if (err) res.status(502).json({success: false, msg: err.message})

    if (!user) {
      return res.status(403).json({success: false, msg: 'Log in failed. User not found.'});
    } else {
      // check if password matches
      user.comparePassword(req.body.password, function (err, isMatch) {
        if (isMatch && !err) {
          // if user is found and password is right create a token
          var token = jwt2.sign(user, config.secret, {
            expiresIn: 2000
          });
          // return the information including token as JSON
          res.status(200).json({success: true, token: 'JWT ' + token});
        } else {
          return res.status(401).json({success: false, msg: 'Log in failed. Wrong password.'});
        }
      });
    }
  });
});

// route to a restricted info (GET http://localhost:4200/api/checktoken)
apiRoutes.get('/checktoken', passport.authenticate('jwt', {session: false}), function (req, res) {
  var token = getToken(req.headers);

  if (token) {
    jwt2.verify(token, config.secret, function (err, decoded) {
      if (err) {
        res.status(489).send({success: false, msg: 'invalid token'});
      }
      else {
        var userName = ''

        if (!decoded._doc) {
          userName = decoded.name
        } else {
          userName = decoded._doc.name;
        }
        res.status(200).json({success: true, msg: userName});
      }
    });
  }
  else {
    return res.status(499).send({success: false, msg: 'No token provided.'});
  }

});

//the function for getting the token
getToken = function (headers) {
  if (headers && headers.authorization) {
    var parted = headers.authorization.split(' ');
    if (parted.length === 2) {
      return parted[1];
    } else {
      return null;
    }
  } else {
    return null;
  }
};

var listOfUsers = [];
var allUsers = []
apiRoutes.post('/search', function (req, res) {
  listOfUsers = []
  var firstPlayer = req.body.firstPlayer;

  changeStatus(firstPlayer, 'searching for game', function (err, user) {
    if (err) {
      return res.status(502).send({success: false, error: err});
    } else {
      promiseWhile(function () {
        return Date.now() - currentTime < 6000 && listOfUsers.length == 0;
      }, function () {
        setTimeout(findUser, 2000, firstPlayer);
        return Q.delay(500);
      }).then(function () {
        if ((listOfUsers.length == 0)) {
          changeStatus(firstPlayer, 'nothing', function (err, user) {
            if (err) res.status(502).json({success: false, msg: err.message})
            else {
              return res.status(408).json({success: false, msg: 'Request timeout.'});
            }
          });
        }
        else {
          cleanUsers(firstPlayer, allUsers)
          var secondPlayer = listOfUsers[0].name
          changeStatus(firstPlayer, 'playing', function (err, user) {
            if (err) res.status(502).json({success: false, msg: err.message})
            else {
              changeStatus(secondPlayer, 'playing', function (err, user) {
                if (err) res.status(502).json({success: false, msg: err.message})
                else {
                  return res.status(200).json({success: true, player1: firstPlayer, player2: secondPlayer});
                }
              });
            }
          });
        }
      }).done();
    }
  });
  const currentTime = Date.now();
  var checkingTime;

});

function findUser(firstPlayer) {

  User.find({
    status: 'searching for game'
  }, function (err, users) {
    allUsers = users
    cleanUsers(firstPlayer, users)
  });

}

function cleanUsers(firstPlayer, users) {
  listOfUsers = []
  for (var i = 0; i < users.length; i++) {
    if (firstPlayer != users[i].name && users[i].status != 'playing') {
      listOfUsers.push(users[i]);
    }
  }

}

// Logout endpoint
function promiseWhile(condition, body) {
  var done = Q.defer();

  function loop() {
    // When the result of calling `condition` is no longer true, we are
    // done.
    if (!condition()) return done.resolve();
    // Use `when`, in case `body` does not return a promise.
    // When it completes loop again otherwise, if it fails, reject the
    // done promise
    Q.when(body(), loop, done.reject);
  }

  // Start running the loop in the next tick so that this function is
  // completely async. It would be unexpected if `body` was called
  // synchronously the first time.
  Q.nextTick(loop);

  // The promise
  return done.promise;
}

apiRoutes.get('/logout/:name', function (req, res) {

  var name = req.params.name;

  // changeStatus(name, 'offline', function (err, user) {
  //   if (err) res.status(502).json({success: false, msg: err.message})
  //   else {
  //     return res.status(200).json({success: true, msg: 'player has been signed out successfully'});
  //   }
  // });
});

apiRoutes.post('/changestatus', function (req, res) {

  var firstPlayer = req.body.firstPlayer
  var secondPlayer = req.body.secondPlayer
  var status = req.body.status

  changeStatus(firstPlayer, status, function (err, user) {
    if (err || !user) res.status(502).json({success: false, msg: 'no user found'})

    changeStatus(secondPlayer, status, function (err, user) {
      if (err || !user) res.status(502).json({success: false, msg: err.message})
      else {
        return res.status(200).json({success: true, msg: 'status has been changed'});
      }
    });
  });
});

function checkStatus(player, callback) {

  User.find({
    name: player
  }, callback);
}

function changeStatus(name, status, callback) {

  User.findOneAndUpdate({
    name: name
  }, {$set: {status: status}}, callback);

}

// connect the api routes under /api
app.use('/api', apiRoutes);

// Start the server
app.listen(port);
console.log('There will be dragons: http://localhost:' + port);
