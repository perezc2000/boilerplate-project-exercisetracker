const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track' )

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Star my code ************************************************************************
const userSchema = new Schema({
  username: {
    type: String, 
    required: true,
    unique: true,
    maxlength: [20, 'username too long']
  }
});

const Users = mongoose.model('Users', userSchema);

const exerciseSchema = new Schema({
  description: {
    type: String,
    required: true,
    maxlength: [20, 'description too long']
  },
  duration: {
    type: Number,
    required: true,
    min: [1, 'duration too short']
  },
  date: {
    type: Date,
    default: Date.now
  },
  username: String,
  userId: {
    type: String,
    ref: 'Users',
    index: true
  }
});

// validate userId, and add "username" to the exercise instance
exerciseSchema.pre('save', function(next) {
  mongoose.model('Users').findById(this.userId, (err, user) => {
    if (err) return next(err);
    
    if (!user) {
      const err = new Error('unknown userId')
      err.status = 400
      return next(err);
    }
    this.username = user.username
    console.log('before', this.date);
    if(!this.date) {
      this.date = Date.now();
    }
    console.log('after', this.date);
    next();
  });
});

const Exercises = mongoose.model('Exercises', exerciseSchema);

app.get('/api/exercise/users', (req, res, next) => {
  Users.find({}, (err, data) => {
    if (err) next(err);
    
    res.json(data);
  })  
});

app.post('/api/exercise/new-user', (req, res, next) => {
  const user = new Users(req.body);
  user.save((err, savedUser) => {
    if(err) {
      if(err.code == 11000) {
        // uniqueness error (no custom message)
        return next({
          status: 400,
          message: 'Username already taken'
        })
      } else {
        return next(err)
      }
    }

    res.json({
      username: savedUser.username,
      _id: savedUser._id
    })
  })
});

app.post('/api/exercise/add', (req, res, next) => {
  Users.findById(req.body.userId, (err, user) => {
    if(err) return next(err)
    
    if(!user) {
      return next({
        status: 400,
        message: 'Unknown userId'
      })
    }
    
    const exercise = new Exercises(req.body)
    exercise.username = user.username
    exercise.save((err, savedExercise) => {
      if(err) return next(err)
      
      savedExercise = savedExercise.toObject()
      delete savedExercise.__v
      delete savedExercise._id
      console.log('post', savedExercise.date);
      savedExercise.date = (new Date(savedExercise.date)).toDateString()
      console.log('toString', savedExercise.date);
      res.json(savedExercise)
    })
  })

})

app.get('/api/exercise/log', (req, res, next) => {
  const from = new Date(req.query.from)
  const to = new Date(req.query.to)

  Users.findById(req.query.userId, (err, user) => {
    if(err) return next(err);
    
    if(!user) {
      return next({ status:400, message: 'Unknown userId' });
    }
    
    Exercises
      .find({
        userId: req.query.userId,
        date: {
          // $lte: to != 'Invalid Date' ? to.getDate() : Date.now() ,
          // $gte: from != 'Invalid Date' ? from.getTime() : 0
          $lte: to != 'Invalid Date' ? to.toISOString() : Date.now() ,
          $gte: from != 'Invalid Date' ? from.toISOString() : 0
        }
      }, {
        __v: 0,
        _id: 0
      })
      .sort('-date')
      .limit(parseInt(req.query.limit))
      .exec((err, exercises) => {
        if(err) return next(err)
      
        const out = {
          userId: req.query.userId,
          username: user.username,
          from : from != 'Invalid Date' ? from.toDateString() : undefined,
          to : to != 'Invalid Date' ? to.toDateString(): undefined,
          count: exercises.length,
          log: exercises.map(e => ({
            description : e.description,
            duration : e.duration,
            date: e.date.toDateString()
          }))
        }
        
        res.json(out)
      })
  })
});

// End my code *************************************************************************

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
