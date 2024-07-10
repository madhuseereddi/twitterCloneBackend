const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

let db = null
let dbPath = path.join(__dirname, 'twitterClone.db')

const DbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server connected at : http://localhost:3000')
    })
  } catch (e) {
    console.log(`Error occured is ${e.message}`)
    process.exit(1)
  }
}

DbServer()

let newfun = async username => {
  let query1 = `
  SELECT following_user_id FROM 
  follower INNER JOIN user on user.user_id = follower.follower_user_id
  WHERE user.username = '${username}'`

  let followingpeople = await db.all(query1)
  const arrayofIds = followingpeople.map(eachItem => eachItem.following_user_id)

  return arrayofIds
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const userCheck = `
  SELECT 
  *
  FROM user
  WHERE username = '${username}'`

  const result5 = await db.get(userCheck)

  if (result5 !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)

      const pushQuery = `
            INSERT INTO 
            user(name,username,password,gender)
            VALUES (
              
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'

            );`

      await db.run(pushQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  let {username, password} = request.body
  let userCheck = `SELECT * FROM user WHERE username = '${username}'`

  let result = await db.get(userCheck)

  if (result !== undefined) {
    let unhasedPassword = await bcrypt.compare(password, result.password)

    if (unhasedPassword === true) {
      payload = {username: username, userId: result.user_id}
      let jwtToken = jwt.sign(payload, 'SAIMADHU')
      response.status(200)
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SAIMADHU', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}

const tweetAcess = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweet = `
  SELECT *
  FROM tweet INNER JOIN follower ON tweet.user_id = following_user_id
  WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}'`

  let result2 = await db.get(getTweet)
  if (result2 === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let {username ,userId} = request
  let followersof = await newfun(username)

  let getQuery = `
  SELECT username,tweet,
  date_time as dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN ('${followersof}')
  ORDER BY dateTime DESC LIMIT 4`

  let result7 = await db.all(getQuery)
  response.send(result7)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  let {userId} = request
  let getQuery = `
  SELECT user.name as name
  FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE follower_user_id = '${userId}' `

  let result = await db.all(getQuery)
  response.send(result)
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {userId} = request
  let getQuery = `
  SELECT user.name as name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE following_user_id = '${userId}' `

  let result = await db.all(getQuery)
  response.send(result)
})

app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetAcess,
  async (request, response) => {
    let {tweetId} = request.params

    let getQuery = `
  SELECT tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') as likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') as replies,
  date_time as dateTime
  FROM tweet 
  WHERE tweet.tweet_id = '${tweetId}'

  `
    let result = await db.get(getQuery)
    response.send(result)
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAcess,
  async (request, response) => {
    let {tweetId} = request.params

    let getQuery = `
    SELECT username 
    FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE tweet_id = '${tweetId}'

  `
    let result = await db.all(getQuery)
    let result2 = result.map(eachItem => eachItem.username)
    response.send({likes: result2})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  tweetAcess,
  async (request, response) => {
    let {tweetId} = request.params

    let getQuery = `
    SELECT name,reply 
    FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE tweet_id = '${tweetId}'

  `
    let result = await db.all(getQuery)

    let result2 = result.map(eachItem => eachItem)
    response.send({replies: result2})
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  let {userId} = request

  let getQuery = `
   SELECT 
    tweet,
    COUNT(DISTINCT like_id) as likes,
    COUNT(DISTINCT reply_id) as replies,
    date_time as dateTime
    FROM tweet
LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
LEFT JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.user_id = '${userId}'
GROUP BY tweet.tweet_id;

 `
  let result = await db.all(getQuery)
  response.send(result)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  let {tweet} = request.body

  let postQuery = `
  INSERT INTO tweet (tweet)
  VALUES (
    '${tweet}'
  )`

  await db.run(postQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    let {tweetId} = request.params
    let {userId} = request
    let getQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}'`

    let result1 = await db.get(getQuery)

    if (result1 === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      let deleteQuery = `
    DELETE from tweet WHERE tweet_id = '${tweetId}'`

      await db.run(deleteQuery)

      response.send('Tweet Removed')
    }
  },
)
module.exports = app
