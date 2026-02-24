const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();

// LINE Bot 設定
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
});

// 簡單的記憶體存儲（實際應使用資料庫）
const bookings = [];
const courses = {
  '1': { name: '朝陽瑜伽', duration: 45, price: 300, capacity: 15 },
  '2': { name: '寧靜冥想', duration: 60, price: 350, capacity: 12 },
  '3': { name: '力量瑜伽', duration: 50, price: 380, capacity: 15 },
  '4': { name: '柔和伸展', duration: 45, price: 300, capacity: 15 },
  '5': { name: '心靈醒覺', duration: 75, price: 400, capacity: 15 },
  '6': { name: '親子瑜伽', duration: 40, price: 250, capacity: 10 }
};

const schedule = {
  '1': { day: '周一', time: '07:00', instructor: '李老師' },
  '2': { day: '周二', time: '10:00', instructor: '陳老師' },
  '3': { day: '周三', time: '18:00', instructor: '林教練' },
  '4': { day: '周四', time: '09:00', instructor: '楊老師' },
  '5': { day: '周五', time: '19:30', instructor: '劉老師' },
  '6': { day: '周六', time: '08:00', instructor: '李老師' }
};

app.use(express.json());

// Middleware 驗證 LINE 簽名
app.post('/webhook', line.middleware({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN, channelSecret: process.env.LINE_CHANNEL_SECRET }), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 事件處理
async function handleEvent(event) {
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  if (event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // 解析用戶指令
  if (userMessage === '查看課程') {
    return handleViewCourses(event.replyToken);
  } else if (userMessage === '查看時間表') {
    return handleViewSchedule(event.replyToken);
  } else if (userMessage === '我的預約') {
    return handleMyBookings(event.replyToken, userId);
  } else if (userMessage === '立即預約') {
    return handleQuickBooking(event.replyToken);
  } else if (userMessage.startsWith('預約')) {
    return handleBooking(event.replyToken, userMessage, userId);
  } else {
    return handleDefault(event.replyToken);
  }
}

// 查看課程
function handleViewCourses(replyToken) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '九容瑜伽課程',
          weight: 'bold',
          size: 'xxl',
          color: '#D97FB8'
        }
      ]
    }
  };

  const courseContents = Object.entries(courses).map(([id, course]) => ({
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: course.name,
          weight: 'bold',
          size: 'lg',
          color: '#D97FB8'
        },
        {
          type: 'box',
          layout: 'baseline',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: '時間:',
              color: '#aaaaaa',
              size: 'sm',
              flex: 0
            },
            {
              type: 'text',
              text: `${course.duration} 分鐘`,
              wrap: true,
              color: '#666666',
              size: 'sm',
              flex: 5
            }
          ]
        },
        {
          type: 'box',
          layout: 'baseline',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: '價格:',
              color: '#aaaaaa',
              size: 'sm',
              flex: 0
            },
            {
              type: 'text',
              text: `$${course.price}`,
              wrap: true,
              color: '#666666',
              size: 'sm',
              flex: 5
            }
          ]
        },
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          action: {
            type: 'message',
            label: '預約此課程',
            text: `預約 ${course.name}`
          },
          color: '#D97FB8'
        }
      ]
    }
  }));

  const flexMessage = {
    type: 'flex',
    altText: '課程列表',
    contents: {
      type: 'carousel',
      contents: courseContents
    }
  };

  return client.replyMessage(replyToken, flexMessage);
}

// 查看時間表
function handleViewSchedule(replyToken) {
  const scheduleText = Object.entries(schedule)
    .map(([id, sch]) => `${sch.day} ${sch.time} - ${courses[id].name}\n教練：${sch.instructor}`)
    .join('\n\n');

  return client.replyMessage(replyToken, {
    type: 'text',
    text: `📅 九容瑜伽周課程時間表\n\n${scheduleText}`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '查看課程',
            text: '查看課程'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '立即預約',
            text: '立即預約'
          }
        }
      ]
    }
  });
}

// 我的預約
function handleMyBookings(replyToken, userId) {
  const userBookings = bookings.filter(b => b.userId === userId);

  if (userBookings.length === 0) {
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '您目前沒有預約。\n輸入「立即預約」開始預約課程！'
    });
  }

  const bookingsList = userBookings
    .map(b => `課程：${b.courseName}\n日期：${b.date}\n時間：${b.time}\n預約時間：${b.bookingTime}`)
    .join('\n\n');

  return client.replyMessage(replyToken, {
    type: 'text',
    text: `📋 您的預約列表\n\n${bookingsList}`
  });
}

// 快速預約
function handleQuickBooking(replyToken) {
  const courseButtons = Object.entries(courses).map(([id, course]) => ({
    type: 'action',
    action: {
      type: 'message',
      label: course.name,
      text: `預約 ${course.name}`
    }
  }));

  return client.replyMessage(replyToken, {
    type: 'text',
    text: '選擇要預約的課程：',
    quickReply: {
      items: courseButtons
    }
  });
}

// 預約課程
function handleBooking(replyToken, userMessage, userId) {
  const courseName = userMessage.replace('預約 ', '');
  const course = Object.entries(courses).find(([id, c]) => c.name === courseName);

  if (!course) {
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '課程不存在。請輸入「查看課程」查看可用課程。'
    });
  }

  // 簡化預約流程：儲存預約並要求確認
  const booking = {
    userId: userId,
    courseName: courseName,
    date: new Date().toISOString().split('T')[0],
    time: schedule[course[0]].time,
    bookingTime: new Date().toLocaleString('zh-TW'),
    status: 'pending'
  };

  bookings.push(booking);

  return client.replyMessage(replyToken, {
    type: 'text',
    text: `✅ 預約成功！\n\n課程：${booking.courseName}\n日期：${booking.date}\n時間：${booking.time}\n\n我們會在 24 小時內確認您的預約。`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '查看時間表',
            text: '查看時間表'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '我的預約',
            text: '我的預約'
          }
        }
      ]
    }
  });
}

// 預設回應
function handleDefault(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: '👋 歡迎來到九容瑜伽！\n請選擇：',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '查看課程',
            text: '查看課程'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '查看時間表',
            text: '查看時間表'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '立即預約',
            text: '立即預約'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '我的預約',
            text: '我的預約'
          }
        }
      ]
    }
  });
}

// 健康檢查
app.get('/', (req, res) => {
  res.json({ message: '九容瑜伽 LINE Bot 正在運行' });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot 在 port ${PORT} 上運行`);
});