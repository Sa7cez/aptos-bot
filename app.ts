const express = require('express')
const path = require('path')
const morgan = require('morgan')
const cors = require('cors')
const helmet = require('helmet')

const app = express()
const PORT = process.env.PORT || 3009

app.use(helmet({ crossOriginResourcePolicy: false }))
app.options('*', cors())

// view engine setup
app.set('views', path.join(__dirname, 'src/views'))
app.set('view engine', 'pug')

app.use(process.env.NODE_ENV !== 'development'
  ? morgan('combined', { skip: (req, res) => res.statusCode < 400 })
  : morgan('dev')
)

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'public')))
console.log(__dirname + '/node_modules/bulma/css')
app.use('/bulma', express.static(__dirname + '/node_modules/bulma/css'))

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Aptos Tools',
    url: 'http://localhost:3009'
  })
});

app.get('/vanity', (req, res) => {
  res.render('vanity')
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('Web server started at http://%s:%s', server.address().address, server.address().port)
})