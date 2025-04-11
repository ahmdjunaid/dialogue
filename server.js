const express = require('express')
const app = express()
const env = require('dotenv').config()
const ejs = require('ejs')
const path = require('path')
const nocache = require('nocache')
const connectDB = require('./config/db')
const userRoute = require('./routes/user')
const adminRoute = require('./routes/admin')
const session = require('express-session')
const passport = require('./config/passport')

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static('public'))
app.use('/uploads', express.static('uploads'));

app.use(nocache())

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 72
    }
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(passport.initialize())
app.use(passport.session())

// cache management
app.use((req, res, next) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });


app.use('/', userRoute);
app.use('/admin', adminRoute);

connectDB()

const port = process.env.PORT || 7001
app.listen(port, () => {
    console.log('Server started at localhost', port)
})

module.exports = app;