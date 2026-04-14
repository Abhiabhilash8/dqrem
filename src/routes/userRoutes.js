const exp = require("express");
const router = exp.Router();

const { registerUser } = require("../controllers/userController");

router.post("/register", registerUser);

module.exports = router;