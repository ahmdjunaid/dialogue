const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZ_PAY_ID,
  key_secret: process.env.RAZ_PAY_SECRET,
});

module.exports = razorpay;