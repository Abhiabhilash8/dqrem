const User = require("../models/user");

const registerUser = async (req, res) => {
  const { email, username } = req.body;

  try {
    const existing = await User.findOne({ email });

    if (existing) {
      return res.send("User already registered");
    }

    const user = new User({ email, username });
    await user.save();

    res.send("User registered successfully ✅");

  } catch (err) {
    console.log(err);
    res.status(500).send("Error");
  }
};

module.exports = { registerUser };