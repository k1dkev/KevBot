// Offline CLI smoke: fail before any accidental HTTP, TCP or TLS connection.
globalThis.fetch = async () => {
  throw new Error("Network disabled in offline test");
};
require("node:net").Socket.prototype.connect = function () {
  throw new Error("Network disabled in offline test");
};
require("node:tls").connect = () => {
  throw new Error("Network disabled in offline test");
};
