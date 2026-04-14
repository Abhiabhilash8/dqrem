const mongoose  = require("mongoose")


const userSchema = new mongoose.Schema({
    email: String,
    username: String,
    lastNotified: String,
});


module.exports = mongoose.model("User", userSchema);