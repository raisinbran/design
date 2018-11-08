//Note: Disregards functionality of MC, M+, M- and MR.
var counter = 0; //Imposes digit limit on display.
var number_x = null;
var number_y = null;
var operator_holder = null; //Javascript behaves unpredictably when trying to directly compare unicode, so simple symbols will perform the actual booleans.
var decimal = false;
var equal = false;
number.innerHTML = 0;

function reset() { //Resets counter, decimal.
  counter = 0;
  decimal = false;
  //console.log("next num");
}

function clear() {
  reset();
  number_x = null;
  number_y = null;
  operator.innerHTML = null;
  operator_holder = null;
  number.innerHTML = 0;
  equal = false;
  //console.log("cleared");
}

function operate() {
  if ((number_x) && (operator_holder)) {
    number_y = number.innerHTML;
    if (!number_y) return;
    if (operator_holder == "+") {
      number.innerHTML = parseFloat(number_x) + parseFloat(number_y);
      //console.log("add");
    } else if (operator_holder == "-") {
      number.innerHTML = parseFloat(number_x) - parseFloat(number_y);
      //console.log("sub");
    } else if (operator_holder == "*") {
      number.innerHTML = parseFloat(number_x) * parseFloat(number_y);
      //console.log("mult");
    } else if (operator_holder == "/") {
      if (parseFloat(number_y) === 0) {
        number.innerHTML = "Not a number"; //For some reason this cannot detect 0 sometimes.
        return;
      }
      number.innerHTML = parseFloat(number_x) / parseFloat(number_y);
      //console.log("div");
    } //else console.log("Error: op");
    //number.innerHTML = parseFloat(number.innerHTML).toFixed(9);
    if (number.innerHTML.length > 10) number.innerHTML = parseFloat(number.innerHTML).toExponential(9);
    number_x = number.innerHTML;
  } else {
    number_x = number.innerHTML;
    //console.log("saved");
  }
  reset(); //Enter next number.
  //console.log("op");
}

for (var i = 0; i < 10; i++) {
  var button = document.getElementById("button-" + i);
  button.onclick = function(e) {
    if (counter === 0) {
      if (equal) {
        clear();
        equal = false;
      }
      number.innerHTML = null;
      //console.log("counter 0");
    }
    if (counter < 15) {
      number.innerHTML = number.innerHTML + e.target.id.substring(7);
      if (number.innerHTML != "0") counter++;
    }
  }
}
document.getElementById("button-sign").onclick = function() {
  number.innerHTML = parseFloat(number.innerHTML) * -1;
  if ((decimal) && (parseFloat(number.innerHTML) === 0)) {
    number.innerHTML = number.innerHTML + ".";
    //console.log("dec & signed");
  }
}
document.getElementById("button-plus").onclick = function() {
  operate();
  operator.innerHTML = "&plus;";
  operator_holder = "+";
}
document.getElementById("button-minus").onclick = function() {
  operate();
  operator.innerHTML = "&minus;";
  operator_holder = "-";
}
document.getElementById("button-multiply").onclick = function() {
  operate();
  operator.innerHTML = "&times;";
  operator_holder = "*";
}
document.getElementById("button-divide").onclick = function() {
  if (operator_holder != "/") operate();
  operator.innerHTML = "&divide;";
  operator_holder = "/";
}
document.getElementById("button-equal").onclick = function() {
  if (operator_holder) {
    equal = true;
    operate();
    reset();
    operator.innerHTML = null;
    operator_holder = null;
    //console.log("equal");
  }
}
document.getElementById("button-decimal").onclick = function() {
  if (counter === 0) {
    number.innerHTML = 0;
    //console.log("0 & dot");
  }
  if (!decimal) {
    if (number.innerHTML === 0) number.innerHTML = number.innerHTML + "0.";
    else number.innerHTML = number.innerHTML + ".";
    decimal = true;
    counter++;
  }
}
document.getElementById("button-c").onclick = function() {
  clear();
}