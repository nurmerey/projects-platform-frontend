// const cookieSession = require('cookie-session');
const { URLSearchParams } = require('url');
const express = require('express');
const router = express.Router();
const pg = require('pg');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const axios = require('axios');

require('dotenv').config();
const client_id = process.env.GITHUB_KEY;
const client_secret = process.env.GITHUB_SECRET;

//connect to the database
const client = new pg.Client(process.env.DATABASE_URL);
client.connect()

function User(data) {
  this.token = data.token ? data.token : '';
  this.experience_lvl = data.experience_lvl ? data.experience_lvl : 0;
  this.position = data.position ? data.position : '';
  this.github_username = data.github_username ? data.github_username : '';
  this.github_id = data.github_id ? data.github_id : '';
  this.github_url = data.github_url ? data.github_url : '';
  this.avatar_url = data.avatar_url ? data.avatar_url : '';
  this.gravatar_url = data.gravatar_url ? data.gravatar_url : '';
  this.last_login = data.last_login ? data.last_login : null;
  this.is_superuser = data.is_superuser ? data.is_superuser : false;
  this.username = data.username ? data.username : '';
  this.first_name = data.first_name ? data.first_name : '';
  this.last_name = data.last_name ? data.last_name : '';
  this.email = data.email ? data.email : '';
  this.is_active = data.is_active ? data.is_active : true;
  this.date_joined = data.date_joined ? data.date_joined : null;
}

router.get("/", (req, res) => {
  res.send("Hello GitHub auth");
});

router.get("/auth/github", (req, res) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${client_id}&scope=user:email`;
  res.redirect(url);
});

router.get("/auth/github/callback", async (req, res) => {
  const code = req.query.code;
  let access_token = await getAccessToken(code, client_id, client_secret)
    .then((access_token) => {
      return access_token;
    }).catch(error => {
      return null;
    });
  if (access_token === null) {
    res.status(400).send("Error: could not get access token from Github");
  }
  await fetchGitHubUser(access_token)
    .then(async (user) => {
      if (user) {
        const user_token = jwt.sign(
          { userId: user.id },
          process.env.TOKEN_SECRET,
          { expiresIn: '24h' });
        await checkUser(user, user_token, res);
      } else {
        res.status(400).send("Error: Github user is null");
      }
    })
    .catch(err => {
      res.status(400).send("Error: Could not get user from Github");
    });
});

async function getAccessToken(code, client_id, client_secret) {
  const result = await axios(
    {
      method: 'post',
      url: "https://github.com/login/oauth/access_token",
      data: {
        client_id,
        client_secret,
        code
      }
    }
  ).then(data => {
    const params = new URLSearchParams(data.data);
    const access_token = params.get("access_token");
    return access_token;
  })
    .catch(err => {
      throw err;
    });
  return result;
}

async function fetchGitHubUser(token) {
  const request = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "token " + token
    }
  });
  return await request.json();
}

async function checkUser(user_data, token, res) {
  let SQL = 'SELECT * FROM Users WHERE github_id=$1;';
  let values = [user_data.id];
  await client.query(SQL, values)
    .then(result => {
      const user = result.rows[0];
      if (user !== undefined) {
        let SQL = 'UPDATE Users SET token = $1 WHERE token=$2;';
        let values = [token, user.token];
        client.query(SQL, values)
          .then(result => {
            res.redirect("/");
          })
          .catch(err => {
            throw err;
          });
      } else {
        createUser(user_data, token);
        res.redirect("/");
      }
    })
    .catch(err => {
      throw err;
    });
}

function createUser(user_data, user_token) {
  const newUser = new User({
    token: user_token,
    github_username: user_data.login,
    github_id: user_data.id,
    github_url: user_data.url,
    avatar_url: user_data.avatar_url,
    gravatar_url: user_data.gravatar_id
  });

  // save user to sql
  let SQL = 'INSERT INTO users (token, experience_lvl, position, github_username, github_id, github_url, avatar_url, gravatar_url, last_login, is_superuser, username, first_name, last_name, email, is_active, date_joined) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id;';
  let values = [newUser.token, newUser.experience_lvl, newUser.position, newUser.github_username, newUser.github_id, newUser.github_url, newUser.avatar_url, newUser.gravatar_url, newUser.last_login, newUser.is_superuser, newUser.username, newUser.first_name, newUser.last_name, newUser.email, newUser.is_active, newUser.date_joined];
  client.query(SQL, values)
}

// router.get("/logout", (req, res) => {
//   if (req.session) req.session = null;
//   res.redirect("/");
// });

module.exports = router;
