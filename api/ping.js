'use strict';
module.exports = function (req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, ping: 'pong' }));
};
