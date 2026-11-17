// Test fixture: hangs forever when the first argument is the string "hang";
// otherwise returns its argument. Not a Graveyard package.
module.exports = function hangOnMarked(x) {
  if (x === 'hang') {
    for (;;) {
      // busy loop
    }
  }
  return x;
};
