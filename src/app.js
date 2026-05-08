const exp = require("express")
const cron = require("node-cron")
const nodemailer = require("nodemailer")
const {LeetCode}=require("leetcode-query")
const connectDB = require("./db/db")
const User = require("./models/user")
const userRoutes = require("./routes/userRoutes");
const path = require("path");
require("dotenv").config();

const app = exp();

connectDB();



app.get("/", (req, res) => {
  console.log("hit at root")
  res.sendFile(path.join(__dirname, "../index.html"));
});
app.use(exp.json());

// mount routes
app.use("/api", userRoutes);

const leetcode = new LeetCode() 


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

async function sendMail(to,title){
    console.log("here in sendMail function fortesting mai:",to)
    await transporter.sendMail({
        from: process.env.EMAIL,
        to: to,
        subject: "LeetCode Reminder 🚨",
        text: `Time to solve today's question !!!!! ${title}`,
    });
}




function checkIfSolved(title,sublist){
    // sub list is array of objects where each object.title says submission question title

    let flag = false;
    for(let sub of sublist){
        if((sub.title === title) && sub.statusDisplay == "Accepted"){
            flag = true;
            break;
        }
    }


    return flag;
}



async function checkAndNotify(username, email) {
  try {
    const daily = await leetcode.daily();

    let recent;

    try {
      recent = await leetcode.user(username);
    } catch (err) {
      console.log(`Invalid LeetCode user: ${username}`);
      return; // stop execution for this user
    }

    // 🔹 Check if user data exists
    if (!recent || !recent.recentSubmissionList) {
      console.log(`No data found for user: ${username}`);
      return;
    }

    const sl = recent.recentSubmissionList || [];

    const solved = checkIfSolved(daily.question.title, sl);

    if (!solved) {
        try {
            await sendMail(email, daily.question.title);
        } catch (err) {
            console.log(`Mail failed for ${email}`);
            console.log(err);
        }
    }

  } catch (err) {
    console.log("Error in checkAndNotify:", err);
    console.log(err);
  }
}


app.get("/run-reminder", async (req, res) => {

    // 🔒 protect route
    if(req.query.key !== process.env.REMINDER_KEY){
        return res.status(403).send("Forbidden");
    }

    console.log("Reminder route triggered");

    try {

        const users = await User.find();

        console.log("Total users:", users.length);

        for(let user of users){

            console.log("Checking user:", user.username);

            await checkAndNotify(user.username, user.email);
        }

        res.send("Reminder execution completed");

    } catch(err){

        console.log("Reminder route error:", err);

        res.status(500).send("Internal Server Error");
    }
});




// i got recent submissions and dailyq names while fetching
module.exports = app