import bodyParser from 'body-parser'; //解JSON
import linebot from 'linebot';
import fetch from 'node-fetch';//發HTTP Request到DC的WebHook
import express from 'express';//架api server
import { MongoClient, ServerApiVersion } from 'mongodb';//mongoDB driver
//express初始化
const app = express();	// app為express的應用實例
app.use(bodyParser.json());//用來解析req的body
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');// 設置允許的來源
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');// 設置允許的請求方法
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');// 設置允許的請求標頭
  res.setHeader('Access-Control-Allow-Credentials', 'true');// 允許跨域請求攜帶認證資訊（如 cookie）
  next();// 繼續處理下一個中介軟體或路由處理函式
});
//mongodb初始化
const uri = "mongodb://127.0.0.1:27017";//localhost會出錯
const client = new MongoClient(uri);
let database;
let coll;
async function connectDatabase() {
  try {
    await client.connect();
    database = client.db("IOT");
    coll = database.collection("ITI");//Infrared Thermal Imaging
    console.log("Connected to the database");
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}
connectDatabase();//只建立一次連接並不斷開 而非每次都重新連
//Line初始化
var bot = linebot({//lineBot相關參數
  channelId: '2005467883',
  channelSecret: '4e75337199cbd8bb6b292d2678c671a8',
  channelAccessToken: 'mYW2cmBTpkHIaiQV216KDkAVQfNiLh84XibUWT3OupBxeWXW5J6QFtX1L6SqHpvFZVwfBPGBGlEXqaIykhPZ6jlNVGS1+U2ylAk1i+RkeK2JOfY8nIeQ7gna1lHabWiMPjYkTaJQ+8pvpp9FoifxFQdB04t89/1O/w1cDnyilFU='
});
const lineIds = ['U29c3c8da576de06fdb8e81c58be9bb00'];//第一個ID崔士豪
function sendToLineBot(text) {//發送linebot訊息
  const message = {
    type: 'text',
    text: text
  };
  lineIds.forEach(lineId => { bot.push(lineId, message) });
}
//DC初始化
const webhookUrl = 'https://discord.com/api/webhooks/1245358746981367869/L-gUH9n-GRFVTECVKsihwTBTdqUwlTVJp4C8iZU66151ZjnyEUR0GGY4IBlUNV3M6Kri';
function sendToDiscord(text) {//發到DC頻道
  const message = {
    content: text
  };
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })
}
//全域變量
let lineNotify = false;
let dcNotify = false;
let maxTemp = 30;
let avgTemp = 30;



//api方法
app.get('/', function (req, res) {//http://localhost:3406/會看到的資料
  res.status(200).send('JS server is running');
})

app.post('/api/iti/', function (req, res) {//新增一筆量測數據 完成
  const sensingData = req.body; //從request中獲取新增的文件
  const temperature = sensingData.temperature;
  const timestamp = new Date();//ISO格式
  function calculateStats(temperatures) {//算平均跟最高溫
    let sum = 0;
    let max = -Infinity;

    for (let i = 0; i < temperatures.length; i++) {
      sum += temperatures[i];
      if (temperatures[i] > max) {
        max = temperatures[i];
      }
    }

    const avg = sum / temperatures.length;
    console.log(avg);
    return { average: avg, max: max };
  }

  async function insert() {//塞進DB
    try {
      const result = await coll.insertOne({ temperature: temperature, date: timestamp }); //插入文檔並獲取結果
      res.status(200).send(result); //發送結果給客戶端
      //console.log(result);
    }
    catch (error) {
      console.error("Error inserting data:", error);
      res.status(500).send('Error inserting data');
      console.log(error);
    }
  }
  insert(); //執行異步函數
  const result = calculateStats(temperature);
  if (lineNotify)//linebot通知
  {
    if (result.max >= maxTemp)
      sendToLineBot(`目前最高溫：${result.max}已超過設定值${maxTemp}`);
    if (result.average >= avgTemp)
      sendToLineBot(`目前平均溫：${result.average}已超過設定值${avgTemp}`);
  }
  if (dcNotify)//DC通知
  {
    if (result.max >= maxTemp)
      sendToDiscord(`目前最高溫：${result.max}已超過設定值${maxTemp}`);
    if (result.average >= avgTemp)
      sendToDiscord(`目前平均溫：${result.average}已超過設定值${avgTemp}`);
  }
})

app.post('/api/notify/', function (req, res) {//推播開關
  const notifyData = req.body;
  console.log(req.body);
  lineNotify = notifyData.lineNotify;
  dcNotify = notifyData.dcNotify;
  maxTemp = notifyData.maxTemp;
  avgTemp = notifyData.avgTemp;
  res.status(200).send(' setting success');
})
app.get('/api/notify/', function (req, res) {//取得推播設定內容
  const Data = {
    lineNotify: lineNotify,
    dcNotify: dcNotify,
    maxTemp: maxTemp,
    avgTemp: avgTemp
  };
  res.json(Data);
})

app.delete('/', function (req, res) {//刪除全部資料
  async function run() {
    try {
      const result = await coll.deleteMany({}); // 刪除集合中的所有文檔
      res.status(200).json({ message: '所有文檔已成功刪除' });
    } catch (error) {
      console.error("Error deleting data:", error);
      res.status(500).json({ error: '無法刪除文檔' });
    }
  }
  run(); // 執行異步函數
});

app.get('/api/iti/all', function (req, res) {//取得全部資料
  const startDate = new Date(req.query.start);
  const endDate = new Date(req.query.end);

  if (isNaN(startDate) || isNaN(endDate)) {// 檢查日期範圍的有效性
    res.status(400).send('Invalid date format');
    return;
  }

  const query = {// 構建查詢條件
    date: {
      $gte: startDate,
      $lte: endDate
    }
  };

  async function run() {
    try {
      const result = await coll.find(query, {}).toArray(); // 執行查詢並獲取結果
      const data = result.map(item => ({
        temperature: item.temperature,
        time: item.date
      }));
      res.json(data); // 回傳查詢結果
    } catch (error) {
      console.error('Error retrieving data:', error);
      res.status(500).send('Error retrieving data');
    }
  }
  run(); // 執行異步函數
});

app.get('/api/iti/new', function (req, res) {//取得最新資料
  async function run() {
    try {
      const result = await coll.find().sort({ date: -1 }).limit(1).toArray(); // 查詢並按日期排序，只取最新的一筆
      if (result.length === 0) {
        res.status(404).send('No data found');
        return;
      }
      const latestData = {
        temperature: result[0].temperature,
        time: new Date(result[0].date).getTime()
      };
      res.json(latestData); // 回傳最新的結果
    } catch (error) {
      console.error('Error retrieving data:', error);
      res.status(500).send('Error retrieving data');
    }
  }
  run(); // 執行異步函數
});

app.get('/api/timeZone', function (req, res) {//時間區間
  async function run() {
    try {
      // 聚合管道
      const pipeline = [
        {
          $group: {
            _id: null,
            earliest: { $min: "$date" },
            latest: { $max: "$date" }
          }
        },
        {
          $project: {
            _id: 0,
            earliest: 1,
            latest: 1
          }
        }
      ];

      // 執行聚合管道
      const result = await coll.aggregate(pipeline).toArray();
      if (result.length > 0) {
        const timeRange = result[0];
        res.json({
          earliest: new Date(timeRange.earliest).getTime(),
          latest: new Date(timeRange.latest).getTime()
        });
      } else {
        res.status(404).json({ message: 'No data found' });
      }
    } catch (err) {
      console.error('Error executing aggregation pipeline:', err);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
  run(); // 執行異步函數
});

app.get('/api/analyze', function (req, res) {//最大值與平均值 一張圖
  const mode = req.query.mode;
  console.log(mode);
  async function run() {
    try {
      let pipeline = [];
      switch (mode) {
        case "maxp":
          pipeline = [
            {
              $unwind: "$temperature"
            },
            {
              $group: {
                _id: null,
                max_temperature: {
                  $max: "$temperature"
                }
              }
            },
            {
              $project: {
                _id: 0,
                max_temperature: 1
              }
            }
          ];
          break;
        case "avgp":
          pipeline = [
            {
              $unwind: "$temperature"
            },
            {
              $group: {
                _id: null,
                average_temperature: {
                  $avg: "$temperature"
                }
              }
            },
            {
              $project: {
                _id: 0,
                average_temperature: 1
              }
            }
          ];
          break;
        case "maxf":
        case "avgf":
          pipeline = [
            {
              $unwind: {
                path: "$temperature",
                includeArrayIndex: "index"
              }
            },
            {
              $group: {
                _id: "$index",
                max_temperature: {
                  $max: "$temperature"
                },
                avg_temperature: {
                  $avg: "$temperature"
                }
              }
            },
            {
              $sort: {
                _id: 1
              }
            },
            {
              $group: {
                _id: null,
                max_temperatures: {
                  $push: "$max_temperature"
                },
                avg_temperatures: {
                  $push: "$avg_temperature"
                }
              }
            },
            {
              $project: {
                _id: 0,
                max_temperatures: 1,
                avg_temperatures: 1
              }
            }
          ];
          break;

      }
      const result = await coll.aggregate(pipeline).toArray();
      if (result.length > 0) {
        const data = result[0];
        res.json(data);
      } else {
        res.status(404).json({ message: 'No data found' });
      }
    } catch (err) {
      console.error('Error executing aggregation pipeline:', err);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  };
  run(); // 執行異步函數
});

app.listen('3406', function () {
  console.log('IOT Server Running...')//顯示在下面視窗
})