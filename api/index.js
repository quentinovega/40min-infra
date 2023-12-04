const express = require('express');
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 3000;
const env = process.env.ENV || 'dev';

const tokenKey = process.env.TOKEN_KEY || 'secret';

const app = express();

function generateData(nbr) {
  const items = [];
  for (let i = 0; i < nbr; i++) {
    items.push(Math.floor((Math.random() * 100) + 100));
  }
  return items;
}

function OtoroshiMiddleware(opts = {}) {
  return (req, res, next) => {
    const state = req.get("Otoroshi-State") || "none";
    const v2 = state.indexOf("eyJ") === 0 && state.indexOf(".") > -1;
    if (v2) {
      jwt.verify(req.get("Otoroshi-State") || 'none', tokenKey, {issuer: 'Otoroshi'}, (err, decodedState) => {

        if (req.get("Otoroshi-Claim")) {
          jwt.verify(req.get("Otoroshi-Claim") || 'none', tokenKey, {issuer: 'Otoroshi'}, (err, decoded) => {
            if (err) {
              res.status(500).send({error: 'error decoding jwt', nerror_description: err.message});
            } else {
              req.challengeVersion = "V2";
              req.token = decoded;
              const ttl = 10 // by default its 30 seconds in the UI
              const now = Math.floor(Date.now() / 1000)
              const token = {'state-resp': decodedState.state, iat: now, nbf: now, exp: now + ttl, aud: 'Otoroshi'}
              res.set("Otoroshi-State-Resp", jwt.sign(token, tokenKey, {algorithm: 'HS512'}))
              next();
            }
          });
        } else {
          req.challengeVersion = "V2";
          const ttl = 10 // by default its 30 seconds in the UI
          const now = Math.floor(Date.now() / 1000)
          const token = {'state-resp': decodedState.state, iat: now, nbf: now, exp: now + ttl, aud: 'Otoroshi'}
          res.set("Otoroshi-State-Resp", jwt.sign(token, tokenKey, {algorithm: 'HS512'}))
          next();
        }
      });
    } else {
      res.set("Otoroshi-State-Resp", req.get("Otoroshi-State") || 'none');
      if (req.get("Otoroshi-Claim"))
        jwt.verify(req.get("Otoroshi-Claim") || 'none', tokenKey, {issuer: 'Otoroshi'}, (err, decoded) => {
          if (err) {
            res.status(500).send({error: 'error decoding jwt', nerror_description: err.message});
          } else {
            req.challengeVersion = "V1";
            req.token = decoded;
            next();
          }
        });
      else
        res.status(401).send({error: 'Your unauthaurized to use this API, go away mother f***er'});
    }
  }
}

const datas = {
  'dev': generateData(5),
  'preprod': generateData(10),
  'prod': generateData(100),
};

const transformers = {
  'consumer': data => ({label: 'raw values for consumer', caller: 'consumer', env: env, values: data}),
  'partner': data => ({
    label: 'tuned values for privileged partner',
    caller: 'partner',
    env: env,
    values: data.map(v => v + 100)
  }),
  'none': _ => ({error: 'unknown caller'}),
};

const requestHandler = (request, response) => {
  const caller = request.headers['X-Caller-Key'] || request.headers['x-caller-key'] || 'none';
  const data = datas[env] || [];
  const transformer = transformers[caller] || ((data) => ({error: `bad caller ${caller}`}));

  response.status(200)
      .set('Content-Type', 'application/json')
      .set('X-Caller-Was', caller)
      .send(transformer(data))


  // response.writeHead(200, {'Content-Type': 'application/json', 'X-Caller-Was': caller});
  // response.write(JSON.stringify(transformer(data)));
  // response.end();
};

app.use(OtoroshiMiddleware());

app.use('/', requestHandler);

app.use((err, req, res, next) => {
  console.log(err)
  res.status(500).type('application/json').send({error: `server error`, root: err});
});

app.listen(port, () => {
  console.log('challenge-verifier listening on http://0.0.0.0:' + port);
});