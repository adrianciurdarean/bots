const test = require('tape')
const express = require('express')
const request = require('superagent')
const bodyParser = require('body-parser')
const createApp = require('../lib/app')
const {
  co,
  createSimpleMessage,
  setDBSchema,
  bigJsonParser,
  shallowExtend
} = require('../lib/utils')

let availablePort = 27147
const PROVIDER_HANDLE = 'taxtime'

function nextSettings () {
  const app = { port: ++availablePort }
  app.url = `http://localhost:${availablePort}`

  const tradleServer = { port: ++availablePort }
  tradleServer.providerURL = `http://localhost:${availablePort}/${PROVIDER_HANDLE}`

  return { app, tradleServer }
}

test('send', co(function* (t) {
  t.timeoutAfter(500)

  const settings = nextSettings()
  const { close, bot } = createApp({
    autostart: true,
    port: settings.app.port,
    providerURL: settings.tradleServer.providerURL
  })

  const object = createSimpleMessage('hey')
  const message = { object }
  const tradleServerApp = express()
  const resp = {
    _s: 'some sig',
    object: {
      object: shallowExtend({ _s: 'some other sig' }, object)
    }
  }

  tradleServerApp.post(`/${PROVIDER_HANDLE}/message`, bigJsonParser(), function (req, res) {
    t.same(req.body, {
      to: 'ted',
      object
    })

    res.json(resp)
  })

  tradleServerApp.use(function (err, req, res) {
    t.error(err)
    process.exit(1)
  })

  let tradleServer
  yield new Promise(resolve => {
    tradleServer = tradleServerApp.listen(settings.tradleServer.port, resolve)
  })

  bot.once('sent', co(function* () {
    t.same(bot.users.list(), {
      ted: {
        id: 'ted',
        history: [resp]
      }
    })

    tradleServer.close()
    close()
    t.end()
  }))

  bot.send({ userId: 'ted', object: 'hey' })
}))

test('receive', co(function* (t) {
  t.timeoutAfter(500)

  const settings = nextSettings()
  const { close, bot } = createApp({
    autostart: true,
    port: settings.app.port,
    providerURL: settings.tradleServer.providerURL
  })

  const object = createSimpleMessage('hey')
  const message = {
    object: object
  }

  const wrapper = {
    author: 'ted',
    object: message,
    objectinfo: { link: 'something' }
  }

  bot.addReceiveHandler(function () {
    t.same(bot.users.list(), {
      ted: {
        id: 'ted',
        history: [shallowExtend({ inbound: true }, wrapper)]
      }
    })

    close()
    t.end()
  })

  yield request
    .post(settings.app.url)
    .send({
      event: 'message',
      data: wrapper
    })
}))
