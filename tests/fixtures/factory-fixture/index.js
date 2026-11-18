// Test fixture: a factory like `string`. S(value) returns a wrapper whose methods use the value.
// Not a Graveyard package.
function W(v) {
  this.s = v;
}
W.prototype.shout = function (suffix) {
  return String(this.s).toUpperCase() + (suffix === undefined ? '' : suffix);
};
module.exports = function S(v) {
  return new W(v);
};
