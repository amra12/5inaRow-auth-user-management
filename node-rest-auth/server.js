var express     = require('express');
var app         = express();
var bodyParser  = require('body-parser');
var morgan      = require('morgan');
var mongoose    = require('mongoose');
var passport	  = require('passport');
var config      = require('./config/database'); // get db config file
var User        = require('./app/models/user'); // get the mongoose model
var port 	      = process.env.PORT || 8080;
var jwt 			  = require('jwt-simple');

// get the request parameters
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// log to the console
app.use(morgan('dev'));

// Use the passport package in our application
app.use(passport.initialize());

//  Route (GET http://localhost:8080)
app.get('/', function(req, res) {
  res.send(' The API is at http://localhost:' + port + '/api');
});

// connect to MONGODB using mongoose
mongoose.connect(config.database);

// passing the passport for configuration
require('./config/passport')(passport);

// bundle FOR MY API ROOT 
var apiRoutes = express.Router();

// create a new user account (POST http://localhost:8080/api/signup)
apiRoutes.post('/signup', function(req, res) {
  if (!req.body.name || !req.body.password) {
    res.json({success: false, msg: 'Please pass name and password.'});
    
  } else {
    // var token = jwt.encode(user, config.secret);
    var newUser = new User({
      name: req.body.name,
      password: req.body.password
      //,token: jwt.encode(newUser, config.secret)
    });
    // save the user
    console.log('create new user: ' + newUser);
    newUser.save(function(err) {
      if (err) {
        res.json({success: false, msg: 'Username already exists.  ' });
        throw err;
      }
      res.json({success: true, msg: 'Successful created new user.' });
    });
  }
});

// route to log in a user (POST http://localhost:8080/api/login)
apiRoutes.post('/login', function(req, res) {
  User.findOne({
    name: req.body.name
  }, function(err, user) {
    if (err) throw err;

    if (!user) {
      return res.status(403).send({success: false, msg: 'Log in failed. User not found.'});
    } else {
      // check if password matches
      user.comparePassword(req.body.password, function (err, isMatch) {
        if (isMatch && !err) {
          // if user is found and password is right create a token
          var token = jwt.encode(user, config.secret);
          // return the information including token as JSON
          res.json({success: true, token: 'JWT ' + token});
        } else {
          return res.status(403).send({success: false, msg: 'Log in failed. Wrong password.'});
        }
      });
    }
  });
});

// route to a restricted info (GET http://localhost:8080/api/checktoken)
apiRoutes.get('/checktoken', passport.authenticate('jwt', { session: false}), function(req, res) {
  var token = getToken(req.headers);
  console.log('the token: ' + token);
  if (token) {
    var decodedUser = jwt.decode(token, config.secret); // we get the information of the user by decoding his token
    User.findOne({
      name: decodedUser.name 
    }, function(err, user) {
        if (err) throw err;

        if (!user) {
          return res.status(403).send({success: false, msg: 'Log in failed. User not found.'});
        } else {
          res.json({success: true, msg: 'Welcome in the game area ' + user.name + '!'});
          //send the username to API part
        }
    });
  } else {
    return res.status(403).send({success: false, msg: 'No token provided.'});
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

// connect the api routes under /api/*
app.use('/api', apiRoutes);

// Start the server
app.listen(port);
console.log('There will be dragons: http://localhost:' + port);
