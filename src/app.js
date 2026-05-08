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


// 8 AM
cron.schedule("0 8 * * *",async () => {
    const users = await User.find()
    for(let user of users){
       await checkAndNotify(user.username, user.email).catch(()=>console.log("error at 8 am schedule"));;
    }
}, {
  timezone: "Asia/Kolkata"
});

// 12 PM
cron.schedule("0 12 * * *",async () => {
    const users = await User.find()
  for(let user of users){
       await checkAndNotify(user.username, user.email).catch(()=>console.log("error at 12 am schedule"));;
    }
}, {
  timezone: "Asia/Kolkata"
});

// Every hour from 6 PM to 11 PM
cron.schedule("0 18-23 * * *",async () => {
    const users = await User.find()
  for(let user of users){
       await checkAndNotify(user.username, user.email).catch(()=>console.log("error from 6 am schedule"));;
    }
}, {
  timezone: "Asia/Kolkata"
});

// for testing
cron.schedule("* * * * *",async () => {
    const users = await User.find()
  for(let user of users){
       if(user.username == 'abhilashsadhu8') await checkAndNotify(user.username, user.email).catch(()=>console.log("error at 12 am schedule"));;
    }
}, {
  timezone: "Asia/Kolkata"
});




// i got recent submissions and dailyq names while fetching
module.exports = app