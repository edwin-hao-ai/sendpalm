// ===================================================================
// SendPalm shared data model (prototype-data.js)
// ===================================================================
const D = {
  user:{
    displayName:'Edwin Hao',
    avatar:'https://picsum.photos/seed/edwinhao/128/128',
    timezone:'Asia/Shanghai',
    language:'zh-CN',
    signature:'Best,\nEdwin'
  },
  accounts:[
    {
      id:'gmail-w', type:'email', provider:'gmail', email:'edwin@sendpalm.com', label:'SendPalm 工作',
      displayName:'Edwin Hao', status:'connected', synced:1247, total:1247, privacy:'unified',
      color:'#ea4335', avatar:'S', lastSync:'刚刚',
      settings:{
        aliases:['edwin@sendpalm.io','e.hao@sendpalm.com'],
        signature:'Best,\nEdwin\nSendPalm',
        replyTo:'',
        defaultFrom:'edwin@sendpalm.com',
        syncFolders:['INBOX','Sent','Drafts','Archive'],
        syncFrequency:'15min',
        autoBcc:false,
        autoBccAddress:'',
        vacationResponder:{ enabled:false, subject:'Out of office', body:'I am out of the office until Aug 5. For urgent matters please contact ops@sendpalm.com.' }
      }
    },
    {
      id:'gmail-p', type:'email', provider:'gmail', email:'edwin.hao@gmail.com', label:'个人 Gmail',
      displayName:'Edwin', status:'connected', synced:892, total:892, privacy:'unified',
      color:'#ea4335', avatar:'G', lastSync:'5分钟前',
      settings:{
        aliases:[],
        signature:'— Edwin',
        replyTo:'',
        defaultFrom:'edwin.hao@gmail.com',
        syncFolders:['INBOX','Sent','Drafts'],
        syncFrequency:'30min',
        autoBcc:true,
        autoBccAddress:'edwin@sendpalm.com',
        vacationResponder:{ enabled:false, subject:'', body:'' }
      }
    },
    {
      id:'outlook', type:'email', provider:'outlook', email:'edwin@sendpalm.com', label:'Outlook',
      displayName:'Edwin Hao', status:'error', error:'令牌过期，请重新认证', synced:503, total:503,
      privacy:'isolated', color:'#0078d4', avatar:'O', lastSync:'3天前',
      settings:{
        aliases:['edwin.hao@outlook.com'],
        signature:'Best regards,\nEdwin',
        replyTo:'',
        defaultFrom:'edwin@sendpalm.com',
        syncFolders:['INBOX','Sent','Drafts'],
        syncFrequency:'1h',
        autoBcc:false,
        autoBccAddress:'',
        vacationResponder:{ enabled:false, subject:'', body:'' }
      }
    },
    { id:'slack', type:'im', provider:'slack', workspace:'sendpalm', label:'Slack · sendpalm', status:'syncing', syncProgress:{done:128,total:340}, privacy:'unified', color:'#4a154b', avatar:'S', lastSync:'同步中' },
    { id:'wechat', type:'im', provider:'wechat', label:'微信', status:'connected', synced:156, total:156, privacy:'isolated', color:'#22c55e', avatar:'微', lastSync:'1小时前' },
    { id:'calendar', type:'calendar', provider:'google', label:'Google 日历', status:'connected', synced:24, total:24, privacy:'unified', color:'#a78bfa', avatar:'日', lastSync:'2小时前' },
  ],
  contacts:[
    {id:"zl",firstName:"磊",lastName:"张",nickname:"",name:"张磊",company:"华为",title:"战略合作总监",emails:[{value:"zhanglei@huawei.com",label:"work"}],phones:[{value:"+86 138****1234",label:"work"}],stage:"active",labels:[],topics:["Q4合同","付款条款","交付物定义"],notes:"Q4 合同推进中，付款条款已调整到 30-40-30。张磊对交付物验收标准比较关注，需提前准备 3 份附件。",avatar:"https://picsum.photos/seed/zhanglei/128/128",photo:"https://picsum.photos/seed/zhanglei/128/128",health:94,sc:94,scC:"#34c759",scL:"活跃",lc:"2天前",grp:"active",trd:"up",pattern:"通常周二上午发邮件，平均回复 4.2h",accounts:["gmail-w","wechat"],stageHistory:[{stage:"build",date:"2026-01-15"},{stage:"active",date:"2026-03-01"}],firstContact:"2026-01-10",milestones:["合同签署 2026-03-15","Q2评审 2026-06-20"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Calendar","WeChat"]},
    {id:"cx",firstName:"欣",lastName:"陈",nickname:"",name:"陈欣",company:"字节跳动",title:"战略合作经理",emails:[{value:"chen.xin@bytedance.com",label:"work"}],phones:[{value:"+86 139****5678",label:"work"}],stage:"build",labels:[],topics:["Q3回顾","Q4规划","API升级"],notes:"Q4 规划基本对齐，整合阶段提前两周需要技术评估。陈欣 Slack 响应很快，紧急事项优先走 Slack。",avatar:"https://picsum.photos/seed/chenxin/128/128",photo:"https://picsum.photos/seed/chenxin/128/128",health:87,sc:87,scC:"#34c759",scL:"活跃",lc:"今天",grp:"active",trd:"up",pattern:"通常下午回复，平均回复 2.1h",accounts:["gmail-w","slack"],stageHistory:[{stage:"explore",date:"2026-04-01"},{stage:"build",date:"2026-05-15"}],firstContact:"2026-04-01",milestones:["Q3合作启动 2026-05"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Slack"]},
    {id:"wy",firstName:"洋",lastName:"王",nickname:"",name:"王洋",company:"阿里巴巴",title:"采购总监",emails:[{value:"wang.yang@alibaba-inc.com",label:"personal"}],phones:[{value:"+86 137****9012",label:"work"}],stage:"cold",labels:[],topics:["Q4提案","预算规划"],notes:"45 天未回复 Q4 提案。王总以前回复很快，近期明显变慢，可能内部预算未定。建议下周电话跟进。",avatar:"https://picsum.photos/seed/wangyang/128/128",photo:"https://picsum.photos/seed/wangyang/128/128",health:34,sc:34,scC:"#ff9500",scL:"需跟进",lc:"7天前",grp:"risk",trd:"dn",pattern:"以前回复很快，近期明显变慢",accounts:["gmail-p","gmail-w"],stageHistory:[{stage:"active",date:"2026-01-01"},{stage:"cold",date:"2026-06-01"}],firstContact:"2025-09-01",milestones:["Q3合同 2025-12"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"lc",firstName:"晨",lastName:"李",nickname:"",name:"李晨",company:"腾讯",title:"技术VP",emails:[{value:"lichen@tencent.com",label:"work"}],phones:[{value:"+86 136****3456",label:"work"}],stage:"cold",labels:[],topics:["技术合作","AI方案"],notes:"已冷淡 62 天。二期立项 busy，建议 2 周后发一份 AI 行业洞察重新激活，不要直接推销。",avatar:"https://picsum.photos/seed/lichen/128/128",photo:"https://picsum.photos/seed/lichen/128/128",health:18,sc:18,scC:"#ff3b30",scL:"已冷淡",lc:"14天前",grp:"cold",trd:"dn",pattern:"之前每月1次沟通，已中断2个月",accounts:["gmail-w","wechat"],stageHistory:[{stage:"active",date:"2025-06-01"},{stage:"cold",date:"2026-05-01"}],firstContact:"2025-03-01",milestones:["AI项目启动 2025-06","一期交付 2026-04"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","WeChat"]},
    {id:"sj",firstName:"静",lastName:"孙",nickname:"",name:"孙静",company:"美团",title:"产品负责人",emails:[{value:"sunjing@meituan.com",label:"work"}],phones:[{value:"+86 135****7890",label:"work"}],stage:"maintain",labels:[],topics:["项目部署","测试计划"],notes:"Alpha 已上线，周五部署前需 review 测试计划。孙静 Slack 响应比邮件快，发票 #1024 已收到，付款期限 30 天。",avatar:"https://picsum.photos/seed/sunjing/128/128",photo:"https://picsum.photos/seed/sunjing/128/128",health:82,sc:82,scC:"#34c759",scL:"活跃",lc:"5天前",grp:"active",trd:"up",pattern:"Slack响应比邮件快，平均2h",accounts:["gmail-w","slack"],stageHistory:[{stage:"build",date:"2025-11-01"},{stage:"active",date:"2026-02-01"},{stage:"maintain",date:"2026-05-01"}],firstContact:"2025-11-01",milestones:["项目Alpha上线 2026-04"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Slack"]},
    {id:"yy",firstName:"雨",lastName:"杨",nickname:"",name:"杨雨",company:"小红书",title:"商务合作",emails:[{value:"yang.yu@xiaohongshu.com",label:"work"}],phones:[{value:"+86 134****2345",label:"work"}],stage:"build",labels:[],topics:["联名活动","创意方案"],notes:"联名活动方案内部已过，创意方向 OK，预算需要再压一压。准备一份更轻量级的资源方案。",avatar:"https://picsum.photos/seed/yangyu/128/128",photo:"https://picsum.photos/seed/yangyu/128/128",health:76,sc:76,scC:"#34c759",scL:"活跃",lc:"3天前",grp:"active",trd:"stable",pattern:"每周1-2次邮件往来",accounts:["gmail-w"],stageHistory:[{stage:"explore",date:"2026-05-01"},{stage:"build",date:"2026-06-01"}],firstContact:"2026-05-01",milestones:[],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"xm",firstName:"明",lastName:"谢",nickname:"",name:"谢明",company:"京东",title:"供应链总监",emails:[{value:"xieming@jd.com",label:"work"}],phones:[{value:"+86 133****6789",label:"work"}],stage:"maintain",labels:[],topics:["供应链评估","Q3报告"],notes:"Q3 供应链评估整体 A-，几个小问题项已标注。明天评审会需带 Q3 报告和 PPT，谢明已发邮箱。",avatar:"https://picsum.photos/seed/xieming/128/128",photo:"https://picsum.photos/seed/xieming/128/128",health:91,sc:91,scC:"#34c759",scL:"活跃",lc:"1天前",grp:"active",trd:"up",pattern:"固定每周一沟通",accounts:["gmail-w"],stageHistory:[{stage:"active",date:"2025-08-01"},{stage:"maintain",date:"2026-03-01"}],firstContact:"2025-05-01",milestones:["供应链框架签约 2025-09"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Calendar"]},
    {id:"lh",firstName:"华",lastName:"刘",nickname:"",name:"刘华",company:"百度",title:"AI合作负责人",emails:[{value:"liuhua@baidu.com",label:"personal"}],phones:[{value:"+86 132****0123",label:"work"}],stage:"cold",labels:[],topics:["AI项目","一期验收"],notes:"一期已验收，二期预算在走流程，预计下月初有结果。不要频繁催促，保持月度节奏。",avatar:"https://picsum.photos/seed/liuhua/128/128",photo:"https://picsum.photos/seed/liuhua/128/128",health:45,sc:45,scC:"#ff9500",scL:"需跟进",lc:"14天前",grp:"risk",trd:"dn",pattern:"项目一期完成后沟通频率下降",accounts:["gmail-p"],stageHistory:[{stage:"build",date:"2025-10-01"},{stage:"active",date:"2026-01-01"},{stage:"cold",date:"2026-06-06"}],firstContact:"2025-10-01",milestones:["AI项目一期启动 2026-01","一期验收 2026-06"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","WeChat"]},
    {id:"zw",firstName:"薇",lastName:"赵",nickname:"",name:"赵薇",company:"网易",title:"市场总监",emails:[{value:"zhaowei@163.com",label:"work"}],phones:[{value:"+86 131****4567",label:"work"}],stage:"active",labels:[],topics:["Q3市场活动","资源支持"],notes:"Q3 活动排期节奏 OK，设计资源下周三到位，文案还需两天。下周一过终稿，需预留半天 review。",avatar:"https://picsum.photos/seed/zhaowei/128/128",photo:"https://picsum.photos/seed/zhaowei/128/128",health:68,sc:68,scC:"#34c759",scL:"活跃",lc:"1周前",grp:"active",trd:"stable",pattern:"每月集中沟通2-3次",accounts:["gmail-w","slack"],stageHistory:[{stage:"build",date:"2026-02-01"},{stage:"active",date:"2026-04-01"}],firstContact:"2026-02-01",milestones:["Q2联合活动 2026-04"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Slack"]},
    {id:"nw",firstName:"Frontend",lastName:"Weekly",nickname:"",name:"Frontend Weekly",company:"Frontend Weekly",title:"",emails:[{value:"editor@frontendweekly.com",label:"personal"}],phones:[],stage:"explore",labels:[],topics:[],notes:"技术周刊订阅。",avatar:"https://picsum.photos/seed/frontendweekly/128/128",photo:"https://picsum.photos/seed/frontendweekly/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"昨天",grp:"",trd:"stable",pattern:"每周二发送",accounts:["gmail-p"],stageHistory:[],firstContact:"2025-01-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"feed",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"aws",firstName:"Amazon",lastName:"Web Services",nickname:"",name:"Amazon Web Services",company:"AWS",title:"",emails:[{value:"billing@aws.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"AWS 账单与系统通知。",avatar:"https://picsum.photos/seed/awsbilling/128/128",photo:"https://picsum.photos/seed/awsbilling/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"2天前",grp:"",trd:"stable",pattern:"月度账单与系统通知",accounts:["gmail-w"],stageHistory:[],firstContact:"2024-06-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"hr",firstName:"HR",lastName:"小助手",nickname:"",name:"HR 小助手",company:"SendPalm",title:"",emails:[{value:"hr@sendpalm.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"公司内部 HR 系统通知。",avatar:"https://picsum.photos/seed/hrassistant/128/128",photo:"https://picsum.photos/seed/hrassistant/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"今天",grp:"",trd:"stable",pattern:"内部通知与考勤提醒",accounts:["gmail-w"],stageHistory:[],firstContact:"2025-03-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"mj",firstName:"杰",lastName:"马",nickname:"",name:"马杰",company:"自由职业",title:"独立开发者",emails:[{value:"majie@gmail.com",label:"personal"}],phones:[{value:"+86 150****8888",label:"work"}],stage:"maintain",labels:[],topics:["开源项目","技术交流"],notes:"老朋友，独立开发者，经常交流技术。",avatar:"https://picsum.photos/seed/majie/128/128",photo:"https://picsum.photos/seed/majie/128/128",health:72,sc:72,scC:"#34c759",scL:"活跃",lc:"3天前",grp:"active",trd:"stable",pattern:"不定期联系",accounts:["gmail-p"],stageHistory:[{stage:"active",date:"2025-06-01"},{stage:"maintain",date:"2026-01-01"}],firstContact:"2020-03-15",milestones:[],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","WeChat"]},
    {id:"lp",firstName:"Lisa",lastName:"Park",nickname:"",name:"Lisa Park",company:"Figma",title:"Product Designer",emails:[{value:"lisa.park@figma.com",label:"work"}],phones:[{value:"+1 415****8921",label:"work"}],stage:"active",labels:[],topics:["设计系统","组件库","Figma plugin"],notes:"Figma 设计系统合作，对组件一致性和无障碍要求很高。沟通以英文为主，重要文档走邮件，日常对齐走 Slack。",avatar:"https://picsum.photos/seed/lisapark/128/128",photo:"https://picsum.photos/seed/lisapark/128/128",health:81,sc:81,scC:"#34c759",scL:"活跃",lc:"2天前",grp:"active",trd:"up",pattern:"太平洋时间上午回复，平均 6h",accounts:["gmail-w","slack"],stageHistory:[{stage:"explore",date:"2025-09-01"},{stage:"build",date:"2025-12-01"},{stage:"active",date:"2026-04-01"}],firstContact:"2025-09-01",milestones:["设计系统评审 2026-04"],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail","Slack"]},
    {id:"tc",firstName:"Tom",lastName:"Chen",nickname:"",name:"Tom Chen",company:"Sequoia Capital",title:"Investment Partner",emails:[{value:"tom.chen@sequoiacap.com",label:"personal"}],phones:[{value:"+1 650****3344",label:"work"}],stage:"build",labels:[],topics:["融资","商业化","市场数据"],notes:"红杉投资人，关注 SendPalm 的商业化路径。需要定期同步关键指标，不要发太长邮件。",avatar:"https://picsum.photos/seed/tomchen/128/128",photo:"https://picsum.photos/seed/tomchen/128/128",health:63,sc:63,scC:"#ff9500",scL:"需跟进",lc:"10天前",grp:"risk",trd:"stable",pattern:"回复周期 3-5 天，偏好简洁数据",accounts:["gmail-p"],stageHistory:[{stage:"explore",date:"2026-02-01"},{stage:"build",date:"2026-05-01"}],firstContact:"2026-02-01",milestones:[],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"sp",firstName:"SendPalm",lastName:"Support",nickname:"",name:"SendPalm Support",company:"SendPalm",title:"",emails:[{value:"support@sendpalm.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"产品客服工单系统。",avatar:"https://picsum.photos/seed/sendpalmsupport/128/128",photo:"https://picsum.photos/seed/sendpalmsupport/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"昨天",grp:"",trd:"stable",pattern:"自动工单 + 人工跟进",accounts:["gmail-w"],stageHistory:[],firstContact:"2025-01-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"gh",firstName:"GitHub",lastName:"",nickname:"",name:"GitHub",company:"GitHub",title:"",emails:[{value:"notifications@github.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"GitHub 仓库通知。",avatar:"https://picsum.photos/seed/githubnotifications/128/128",photo:"https://picsum.photos/seed/githubnotifications/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"今天",grp:"",trd:"stable",pattern:"代码审查与仓库通知",accounts:["gmail-w"],stageHistory:[],firstContact:"2020-01-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"st",firstName:"Stripe",lastName:"",nickname:"",name:"Stripe",company:"Stripe",title:"",emails:[{value:"noreply@stripe.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"Stripe 支付通知。",avatar:"https://picsum.photos/seed/stripebilling/128/128",photo:"https://picsum.photos/seed/stripebilling/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"3天前",grp:"",trd:"stable",pattern:"支付与账单通知",accounts:["gmail-w"],stageHistory:[],firstContact:"2024-01-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"mi",firstName:"米商城",lastName:"小",nickname:"",name:"小米商城",company:"小米",title:"",emails:[{value:"order@mi.com",label:"personal"}],phones:[],stage:"explore",labels:[],topics:[],notes:"电商订单通知。",avatar:"https://picsum.photos/seed/miorders/128/128",photo:"https://picsum.photos/seed/miorders/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"5天前",grp:"",trd:"stable",pattern:"订单与物流通知",accounts:["gmail-p"],stageHistory:[],firstContact:"2023-01-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"paperTrail",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"mom",firstName:"妈",lastName:"妈",nickname:"",name:"妈妈",company:"",title:"",emails:[],phones:[{value:"+86 139****0001",label:"work"}],stage:"maintain",labels:[],topics:["家庭"],notes:"家庭群和个人消息。",avatar:"https://picsum.photos/seed/momchat/128/128",photo:"https://picsum.photos/seed/momchat/128/128",health:0,sc:0,scC:"#34c759",scL:"活跃",lc:"昨天",grp:"active",trd:"stable",pattern:"日常问候",accounts:["wechat"],stageHistory:[],firstContact:"2010-01-01",milestones:[],merged:true,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"imbox",autoLabel:[],recycling:false,ch:["WeChat"]},
    {id:"rec",firstName:"猎头",lastName:"王",nickname:"",name:"王猎头",company:"猎聘网",title:"高级猎头顾问",emails:[{value:"wang.hunter@liepin.com",label:"personal"}],phones:[{value:"+86 138****7777",label:"work"}],stage:"explore",labels:[],topics:[],notes:"猎头推荐，通常直接进 Records。",avatar:"https://picsum.photos/seed/wanghunter/128/128",photo:"https://picsum.photos/seed/wanghunter/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"2周前",grp:"",trd:"stable",pattern:"不定期职位推荐",accounts:["gmail-p"],stageHistory:[],firstContact:"2025-08-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"feed",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"nw2",firstName:"Lenny's",lastName:"Newsletter",nickname:"",name:"Lenny's Newsletter",company:"Lenny Rachitsky",title:"",emails:[{value:"lenny@lennysnewsletter.com",label:"personal"}],phones:[],stage:"explore",labels:[],topics:[],notes:"产品订阅通讯。",avatar:"https://picsum.photos/seed/lennysnewsletter/128/128",photo:"https://picsum.photos/seed/lennysnewsletter/128/128",health:0,sc:0,scC:"#8e8e93",scL:"",lc:"4天前",grp:"",trd:"stable",pattern:"每周产品与管理深度长文",accounts:["gmail-p"],stageHistory:[],firstContact:"2024-03-01",milestones:[],merged:false,blocked:false,notify:true,firstSeen:false,screened:true,defaultBucket:"feed",autoLabel:[],recycling:false,ch:["Gmail"]},
    {id:"unk1",firstName:"新锐",lastName:"李",nickname:"",name:"李新锐",company:"未知公司",title:"商务拓展",emails:[{value:"lixinrui@example.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"",avatar:"",stageHistory:[],blocked:false,notify:false,firstSeen:true,screened:false},
    {id:"unk2",firstName:"Product",lastName:"Hunt",nickname:"",name:"Product Hunt",company:"Product Hunt",title:"",emails:[{value:"noreply@producthunt.com",label:"work"}],phones:[],stage:"explore",labels:[],topics:[],notes:"",avatar:"",stageHistory:[],blocked:false,notify:false,firstSeen:true,screened:false}
  ],
  getP(id){return this.contacts.find(c=>c.id===id)},
  getMsgs(pid){return this._msgs.filter(m=>m.pid===pid).sort((a,b)=>new Date(b.st)-new Date(a.st))},
  getFiles(pid){return this._files.filter(f=>f.pid===pid)},
  getMeetings(pid){return this._meetings.filter(m=>m.pids.includes(pid))},
  getConnections(pid){const p=this.getP(pid);if(!p)return[];return this.contacts.filter(c=>c.id!==pid&&(c.company===p.company||Math.abs(c.sc-p.sc)<30));},
  getAcct(id){return this.accounts.find(a=>a.id===id)},
  stageLabel:{explore:'探索期',build:'建立期',active:'活跃期',maintain:'维护期',cold:'冷淡期',rekindle:'重新激活'},
  stageColor:{explore:'#af52de',build:'#0A8F63',active:'#34c759',maintain:'#5ac8fa',cold:'#ff3b30',rekindle:'#ff9500'},
  stageSuggest:{cold:'建议发送问候重新激活',active:'关系健康，保持当前频率',build:'建议安排一次深度交流',maintain:'维持定期沟通节奏',explore:'建议介绍公司和合作方向',rekindle:'建议提供新的价值点'},
  _msgs:[
    // 张磊 - Q4合同线程
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Q4 合同提案 v3',prev:'附上最新修改版，主要调整了付款条款与交付物验收标准。',tm:'2天前',st:'2026-07-16T14:30',ch:'Gmail',at:['Q4_Proposal_v3.pdf'],fl:'done',ctx:{topic:'Q4合同',people:['cx']}},
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'张磊',tag:'邮件',subj:'Re: Q4 合同提案',prev:'收到，有几个条款需要对齐：付款节奏、交付物定义和违约责任。',tm:'1天前',st:'2026-07-17T11:20',ch:'Gmail',at:[],fl:'wait',ctx:{topic:'Q4合同',people:[]}},
    {pid:'zl',accountId:'wechat',ic:'',fm:'张磊',tag:'微信',subj:'明天见',prev:'会议室已订好，明天下午见。',tm:'今天',st:'2026-07-18T16:45',ch:'WeChat',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Q4 合同提案',prev:'付款节奏可以按 30-40-30 调整，交付物验收标准我附在文档里了。',tm:'1天前',st:'2026-07-17T18:00',ch:'Gmail',at:['Q4_Proposal_v3.pdf'],fl:'done',ctx:{topic:'Q4合同',people:[]}},
    {pid:'zl',accountId:'calendar',ic:'',fm:'系统',tag:'日历',subj:'Q4合同评审会议',prev:'明天 14:00-15:00 · 线上 · SendPalm已生成简报',tm:'明天',st:'2026-07-19',ch:'Calendar',at:[],fl:'',ctx:{topic:'Q4合同',people:[]}},

    // 陈欣 - Q3回顾 & Q4规划 / API升级
    {pid:'cx',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'合作 - Q3回顾 & Q4规划',prev:'随信附上Q3复盘和Q4规划草案，请Review。',tm:'昨天',st:'2026-07-17T09:15',ch:'Gmail',at:['Q3_Review.pdf','Q4_Plan.docx'],fl:'',ctx:{topic:'Q3回顾',people:[]}},
    {pid:'cx',accountId:'gmail-w',ic:'',fm:'陈欣',tag:'邮件',subj:'Re: 合作 - Q3回顾 & Q4规划',prev:'Q4里程碑一致。整合阶段能提前两周吗？我们需要再评估资源。',tm:'1小时前',st:'2026-07-18T10:30',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'Q4规划',people:['zl']}},
    {pid:'cx',accountId:'slack',ic:'',fm:'陈欣',tag:'Slack',subj:'API变更讨论',prev:'我们技术团队建议周四下午对齐方案，你那边可以吗？',tm:'2小时前',st:'2026-07-18T09:00',ch:'Slack',at:[],fl:'',ctx:{topic:'API升级',people:[]}},
    {pid:'cx',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: 合作 - Q3回顾 & Q4规划',prev:'整合阶段提前两周有风险，我周三前给你详细评估。',tm:'30分钟前',st:'2026-07-18T11:45',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'Q4规划',people:[]}},
    {pid:'cx',accountId:'slack',ic:'',fm:'陈欣',tag:'Slack',subj:'API diff 文档',prev:'API差异文档已上传到共享文件夹，有空看一下。',tm:'昨天',st:'2026-07-17T17:20',ch:'Slack',at:[],fl:'',ctx:{topic:'API升级',people:[]}},

    // 王洋 - Q4提案跟进
    {pid:'wy',accountId:'gmail-p',ic:'',fm:'你',tag:'邮件',subj:'Q4 合作提案',prev:'按照上次讨论的方向整理了一份提案，详见附件。',tm:'45天前',st:'2026-06-03T10:00',ch:'Gmail',at:['Q4_Cooperation_Proposal.pdf'],fl:'todo',ctx:{topic:'Q4提案',people:[]}},
    {pid:'wy',accountId:'gmail-w',ic:'',fm:'王洋',tag:'邮件',subj:'Re: Q3 合作总结',prev:'收到，等内部对齐后回复你。',tm:'47天前',st:'2026-06-01T16:30',ch:'Gmail',at:[],fl:'',ctx:{topic:'Q4提案',people:[]}},
    {pid:'wy',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Q4 合作提案',prev:'王总，想了解一下内部对齐的进展，看下周是否有空通个电话？',tm:'7天前',st:'2026-07-13T14:00',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'Q4提案',people:[]}},

    // 李晨 - 技术合作
    {pid:'lc',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'技术合作方案',prev:'整理了一份技术合作方案初稿，请查阅。',tm:'63天前',st:'2026-05-16T11:00',ch:'Gmail',at:['Tech_Partnership_v1.pdf'],fl:'',ctx:{topic:'技术合作',people:[]}},
    {pid:'lc',accountId:'gmail-w',ic:'',fm:'李晨',tag:'邮件',subj:'Re: 技术合作方案',prev:'方案内部评审中，有结论第一时间同步。',tm:'62天前',st:'2026-05-17T15:40',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'技术合作',people:[]}},
    {pid:'lc',accountId:'wechat',ic:'',fm:'李晨',tag:'微信',subj:'最近忙吗',prev:'最近一直在忙二期立项，过两周再细聊。',tm:'35天前',st:'2026-06-15T20:10',ch:'WeChat',at:[],fl:'',ctx:{topic:'技术合作',people:[]}},

    // 孙静 - 项目部署
    {pid:'sj',accountId:'slack',ic:'',fm:'孙静',tag:'Slack',subj:'#project-alpha: 周五部署',prev:'@Edwin 请先 review 测试计划，周四前给我反馈。',tm:'5小时前',st:'2026-07-18T06:30',ch:'Slack',at:[],fl:'todo',ctx:{topic:'项目部署',people:[]}},
    {pid:'sj',accountId:'gmail-w',ic:'',fm:'孙静',tag:'邮件',subj:'发票 #1024 - Q3服务',prev:'附件为Q3咨询发票，付款期限30天，请查收。',tm:'昨天',st:'2026-07-17T10:00',ch:'Gmail',at:['Invoice_1024.pdf'],fl:'',ctx:{topic:'',people:[]}},
    {pid:'sj',accountId:'slack',ic:'',fm:'你',tag:'Slack',subj:'Re: #project-alpha: 周五部署',prev:'测试计划已看，周五上午10点部署可行。',tm:'3小时前',st:'2026-07-18T08:15',ch:'Slack',at:[],fl:'',ctx:{topic:'项目部署',people:[]}},

    // 杨雨 - 联名活动
    {pid:'yy',accountId:'gmail-w',ic:'',fm:'杨雨',tag:'邮件',subj:'Re: 联名活动方案',prev:'方案内部过了，想对齐创意方向和资源分配。',tm:'3天前',st:'2026-07-15T13:20',ch:'Gmail',at:[],fl:'',ctx:{topic:'联名活动',people:[]}},
    {pid:'yy',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'联名活动方案',prev:'这是我们初版的联名活动方案，请Review。',tm:'5天前',st:'2026-07-13T16:00',ch:'Gmail',at:['Co_Branding_Proposal.pdf'],fl:'',ctx:{topic:'联名活动',people:[]}},
    {pid:'yy',accountId:'gmail-w',ic:'',fm:'杨雨',tag:'邮件',subj:'Re: 联名活动方案',prev:'创意方向OK，预算需要再压一压。',tm:'1天前',st:'2026-07-17T19:30',ch:'Gmail',at:[],fl:'',ctx:{topic:'联名活动',people:[]}},

    // 谢明 - 供应链
    {pid:'xm',accountId:'gmail-w',ic:'',fm:'谢明',tag:'邮件',subj:'Q3 供应链评估报告',prev:'Q3评估已完成，整体评级A-，详见附件。',tm:'1天前',st:'2026-07-17T09:00',ch:'Gmail',at:['Supply_Chain_Q3.pdf'],fl:'',ctx:{topic:'供应链评估',people:[]}},
    {pid:'xm',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Q3 供应链评估报告',prev:'收到，明天评审会上过。有几个问题项我先标注了。',tm:'1天前',st:'2026-07-17T14:20',ch:'Gmail',at:[],fl:'',ctx:{topic:'供应链评估',people:[]}},
    {pid:'xm',accountId:'wechat',ic:'',fm:'谢明',tag:'微信',subj:'评审会资料',prev:'明天的PPT我发你邮箱了，注意查收。',tm:'昨天',st:'2026-07-17T18:00',ch:'WeChat',at:[],fl:'',ctx:{topic:'供应链评估',people:[]}},

    // 刘华 - AI项目
    {pid:'lh',accountId:'gmail-p',ic:'',fm:'刘华',tag:'邮件',subj:'AI 合作项目更新',prev:'项目一期已完成内部验收，二期预算正在申请中。',tm:'30天前',st:'2026-06-18T10:30',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'AI项目',people:[]}},
    {pid:'lh',accountId:'gmail-p',ic:'',fm:'你',tag:'邮件',subj:'Re: AI 合作项目更新',prev:'恭喜一期验收。二期启动前我们约个会聊一下范围。',tm:'28天前',st:'2026-06-20T11:00',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'AI项目',people:[]}},
    {pid:'lh',accountId:'gmail-p',ic:'',fm:'刘华',tag:'邮件',subj:'Re: AI 合作项目更新',prev:'二期预算还在走流程，预计下月初有结果。',tm:'14天前',st:'2026-07-06T16:45',ch:'Gmail',at:[],fl:'todo',ctx:{topic:'AI项目',people:[]}},

    // 赵薇 - 市场活动
    {pid:'zw',accountId:'gmail-w',ic:'',fm:'赵薇',tag:'邮件',subj:'Q3 市场活动排期',prev:'Q3活动排期初稿已出，请确认资源和节奏。',tm:'5天前',st:'2026-07-13T10:00',ch:'Gmail',at:['Q3_Marketing_Calendar.xlsx'],fl:'',ctx:{topic:'Q3市场活动',people:[]}},
    {pid:'zw',accountId:'slack',ic:'',fm:'赵薇',tag:'Slack',subj:'资源确认',prev:'设计资源下周三可以到位，文案还需要两天。',tm:'3天前',st:'2026-07-15T14:30',ch:'Slack',at:[],fl:'',ctx:{topic:'Q3市场活动',people:[]}},
    {pid:'zw',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Q3 市场活动排期',prev:'节奏OK，资源按你说的来。下周一我们再过一遍终稿。',tm:'1天前',st:'2026-07-17T16:00',ch:'Gmail',at:[],fl:'',ctx:{topic:'Q3市场活动',people:[]}},

    // 其他系统/群发
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'系统',tag:'邮件',subj:'周报归档提醒',prev:'本周有3封周报已自动归档到「周报」文件夹。',tm:'3天前',st:'2026-07-15T09:00',ch:'Gmail',at:[],fl:'done',ctx:{topic:'',people:[]}},

    // Newsletter / Feed
    {pid:'nw',accountId:'gmail-p',ic:'',fm:'Frontend Weekly',tag:'邮件',subj:'#342: React 19, CSS Anchor Positioning, and the future of view transitions',prev:'本周精选：React 19 正式发布，CSS Anchor Positioning 进入 Baseline，以及一组关于视图过渡的实验性 API。',tm:'昨天',st:'2026-07-19T08:00',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'nw',accountId:'gmail-p',ic:'',fm:'Frontend Weekly',tag:'邮件',subj:'#341: 5 micro-interactions that feel premium',prev:'从 Linear 的菜单动画到 Apple 的弹簧曲线，我们拆解了 5 个让你界面立刻变贵的小细节。',tm:'8天前',st:'2026-07-12T08:00',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'nw',accountId:'gmail-p',ic:'',fm:'Frontend Weekly',tag:'邮件',subj:'[ Sponsor ] Tailwind CSS v4 is here',prev:'新版 Tailwind 带来了基于 CSS 的配置、更快的构建速度和更简洁的语法，值得升级。',tm:'15天前',st:'2026-07-05T08:30',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},

    // Records / transactional
    {pid:'aws',accountId:'gmail-w',ic:'',fm:'AWS',tag:'邮件',subj:'Your AWS July 2026 invoice is available',prev:'Invoice #7752319 for account ending in 4421 is now available. Total: $127.43. Payment method on file will be charged on Aug 3.',tm:'2天前',st:'2026-07-18T02:00',ch:'Gmail',at:['Invoice-7752319.pdf'],fl:'',ctx:{topic:'',people:[]}},
    {pid:'aws',accountId:'gmail-w',ic:'',fm:'AWS',tag:'邮件',subj:'Action required: Enable MFA on your root account',prev:'We noticed your root account does not have multi-factor authentication enabled. Enable it now to protect your resources.',tm:'5天前',st:'2026-07-15T11:20',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'hr',accountId:'gmail-w',ic:'',fm:'HR 小助手',tag:'邮件',subj:'【考勤提醒】7月考勤异常记录待确认',prev:'你本月有 1 条考勤异常记录（7月14日 09:08 打卡），请在 7 月 25 日前在 HR 系统确认。',tm:'今天',st:'2026-07-20T09:00',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'hr',accountId:'gmail-w',ic:'',fm:'HR 小助手',tag:'邮件',subj:'下午茶预算申请已批复',prev:'你提交的 7 月团队下午茶预算 ¥1,200 已批复，发票请走报销系统。',tm:'3天前',st:'2026-07-17T14:00',ch:'Gmail',at:[],fl:'done',ctx:{topic:'',people:[]}},

    // Personal / mixed
    {pid:'mj',accountId:'gmail-p',ic:'',fm:'马杰',tag:'邮件',subj:'周末聚会？',prev:'好久没见了，周六晚上有空吗？老地方。',tm:'3天前',st:'2026-07-17T12:30',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'mj',accountId:'wechat',ic:'',fm:'马杰',tag:'微信',subj:'那个开源库你看了吗',prev:'我推给你的那套状态管理库，试了一下感觉比 Redux 轻很多。',tm:'1周前',st:'2026-07-13T21:00',ch:'WeChat',at:[],fl:'',ctx:{topic:'',people:[]}},

    // More diverse business threads
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'张磊',tag:'邮件',subj:'合同附件 - 验收标准 v2',prev:'验收标准 v2 已补充在附件中，重点看第 3.2 条关于性能指标的描述。',tm:'4小时前',st:'2026-07-20T08:00',ch:'Gmail',at:['Acceptance_Criteria_v2.pdf'],fl:'todo',ctx:{topic:'Q4合同',people:[]}},
    {pid:'cx',accountId:'slack',ic:'',fm:'陈欣',tag:'Slack',subj:'周四会议改到周五上午?',prev:'团队周四临时有全员会，API 对齐可以改周五上午 10 点吗？',tm:'30分钟前',st:'2026-07-20T11:30',ch:'Slack',at:[],fl:'todo',ctx:{topic:'API升级',people:[]}},
    {pid:'yy',accountId:'gmail-w',ic:'',fm:'杨雨',tag:'邮件',subj:'[紧急] 联名活动 KV 需今日确认',prev:'设计稿已出，今天 18:00 前必须定稿否则影响下周上线。',tm:'2小时前',st:'2026-07-20T10:00',ch:'Gmail',at:['KV_v3.jpg'],fl:'todo',ctx:{topic:'联名活动',people:[]}},
    {pid:'sj',accountId:'gmail-w',ic:'',fm:'孙静',tag:'邮件',subj:'Re: Re: 发票 #1024 - Q3服务',prev:'收到，财务已登记。Q4 发票请按新抬头开。',tm:'昨天',st:'2026-07-19T16:00',ch:'Gmail',at:[],fl:'',ctx:{topic:'',people:[]}},

    // Lisa Park - design system collaboration
    {pid:'lp',accountId:'gmail-w',ic:'',fm:'Lisa Park',tag:'邮件',subj:'Design system handoff - Q3',prev:'Hey Edwin, attaching the latest design system handoff. Please check the spacing tokens and iconography section.',tm:'2天前',st:'2026-07-18T09:15',ch:'Gmail',body:'Hi Edwin,\n\nHope you had a good weekend. Attached is the Q3 design system handoff. A few things to call out:\n\n1. We consolidated spacing tokens into 4px, 8px, 12px, 16px, 24px, 32px, 48px.\n2. The iconography set now includes 240 glyphs, all exported as 24dp SVG.\n3. Please pay special attention to the modal component — we changed the corner radius to 16px to match the new native direction.\n\nLet me know if anything looks off. We can review async or jump on a quick call tomorrow.\n\nBest,\nLisa',at:['DS_Handoff_Q3.fig'],fl:'todo',ctx:{topic:'设计系统',people:[]}},
    {pid:'lp',accountId:'slack',ic:'',fm:'Lisa Park',tag:'Slack',subj:'Figma comments resolved',prev:'Left a few comments on the modal spec. Mostly LGTM, one question about focus rings.',tm:'昨天',st:'2026-07-19T14:20',ch:'Slack',body:'Left comments on the modal spec in Figma. One open question: do we want a 2px or 3px focus ring? The accessibility team leans toward 3px but it feels heavy in dense UI. Let me know what you decide.',at:[],fl:'',ctx:{topic:'设计系统',people:[]}},
    {pid:'lp',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Design system handoff - Q3',prev:'Thanks Lisa. The 16px radius works for us. I left a couple of notes in Figma around the toast component.',tm:'昨天',st:'2026-07-19T18:00',ch:'Gmail',body:'Thanks Lisa.\n\nThe 16px radius works for us across modals and drawers. I left a few notes in Figma:\n\n- Toast component: can we reduce the max-width from 480px to 400px? Long error messages feel too wide.\n- Button focus ring: let\'s go with 2px + 2px offset. It matches the native apps.\n\nHappy to sync tomorrow if easier.',at:[],fl:'done',ctx:{topic:'设计系统',people:[]}},

    // Tom Chen - investor thread
    {pid:'tc',accountId:'gmail-p',ic:'',fm:'Tom Chen',tag:'邮件',subj:'Q2 metrics follow-up',prev:'Can you share the Q2 ARR, net revenue retention, and payback period? Board wants a snapshot by Friday.',tm:'10天前',st:'2026-07-10T11:00',ch:'Gmail',body:'Edwin,\n\nQuick follow-up from our last conversation. The partnership team is putting together a market map and would love a snapshot of SendPalm\'s Q2 numbers.\n\nSpecifically:\n- ARR and YoY growth\n- Net revenue retention\n- CAC payback period\n- Logo churn\n\nNo need for a full deck — a short email with the numbers and one-sentence context on each is perfect.\n\nThanks,\nTom',at:[],fl:'todo',ctx:{topic:'融资',people:[]}},
    {pid:'tc',accountId:'gmail-p',ic:'',fm:'你',tag:'邮件',subj:'Re: Q2 metrics follow-up',prev:'Hi Tom, attached the Q2 snapshot. ARR up 142% YoY, NRR at 118%, payback under 14 months.',tm:'8天前',st:'2026-07-12T16:30',ch:'Gmail',body:'Hi Tom,\n\nPlease see the attached snapshot. Highlights:\n\n- ARR: $2.4M (up 142% YoY)\n- Net revenue retention: 118%\n- CAC payback: 13 months\n- Logo churn: 4.2% annually\n- Active seats: 1,840\n\nHappy to walk through the cohort analysis next week if helpful.\n\nBest,\nEdwin',at:['SendPalm_Q2_Snapshot.pdf'],fl:'todo',ctx:{topic:'融资',people:[]}},

    // SendPalm Support - tickets
    {pid:'sp',accountId:'gmail-w',ic:'',fm:'SendPalm Support',tag:'邮件',subj:'[Ticket #4821] Gmail sync paused for your account',prev:'We noticed your Gmail workspace account stopped syncing 3 hours ago. Tap here to reconnect.',tm:'昨天',st:'2026-07-19T22:00',ch:'Gmail',body:'Hi Edwin,\n\nWe noticed that syncing for your Gmail workspace account (edwin@sendpalm.com) paused at 2026-07-19 19:00 UTC.\n\nThis usually happens when the OAuth token expires or when Google detects a policy change. You can reconnect by going to Settings > Accounts > Gmail workspace > Reconnect.\n\nIf the issue persists, reply to this email and we\'ll investigate.\n\n— SendPalm Support',at:[],fl:'',ctx:{topic:'',people:[]}},

    // GitHub - dev notifications
    {pid:'gh',accountId:'gmail-w',ic:'',fm:'GitHub',tag:'邮件',subj:'[sendpalm/web] PR #892 merged: refactor command palette',prev:'refactor command palette (#892) was merged into main by david-kim.',tm:'今天',st:'2026-07-20T08:45',ch:'Gmail',body:'david-kim merged commit abc1234 into main\n\nrefactor command palette (#892)\n\n- Extracted useCommandPalette hook\n- Added keyboard shortcut registry\n- Reduced bundle size by 12KB\n\nView pull request: https://github.com/sendpalm/web/pull/892',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'gh',accountId:'gmail-w',ic:'',fm:'GitHub',tag:'邮件',subj:'Review requested on [sendpalm/web] PR #901',prev:'@edwinhao, david-kim requested your review on #901.',tm:'2小时前',st:'2026-07-20T10:30',ch:'Gmail',body:'@david-kim requested your review on:\n\nsendpalm/web #901: Update navigation to 4-bucket model\n\nThis PR restructures the sidebar navigation and moves workflows into inbox drawers. Please review when you have a moment.',at:[],fl:'todo',ctx:{topic:'',people:[]}},

    // Stripe - billing
    {pid:'st',accountId:'gmail-w',ic:'',fm:'Stripe',tag:'邮件',subj:'Your June 2026 payout has been deposited',prev:'A payout of $14,230.00 has been deposited to your bank account ending in 4421.',tm:'3天前',st:'2026-07-17T03:00',ch:'Gmail',body:'Hi SendPalm, Inc.,\n\nA payout of $14,230.00 USD has been deposited into your bank account ending in 4421.\n\nPayout date: July 17, 2026\nPayout ID: po_1OExample\n\nYou can view the full breakdown in your Stripe Dashboard.\n\n— Stripe',at:[],fl:'',ctx:{topic:'',people:[]}},

    // 小米商城 - e-commerce
    {pid:'mi',accountId:'gmail-p',ic:'',fm:'小米商城',tag:'邮件',subj:'订单已发货：12678934501',prev:'您购买的 Xiaomi 14 Ultra 已发货，预计 7 月 23 日送达。',tm:'5天前',st:'2026-07-15T16:20',ch:'Gmail',body:'尊敬的用户，\n\n您购买的商品已发货。\n\n订单号：12678934501\n商品：Xiaomi 14 Ultra 16GB+1TB 白色\n承运：顺丰速运\n运单号：SF1234567890\n预计送达：2026-07-23\n\n点击「查看物流」可实时追踪。\n\n小米商城',at:[],fl:'',ctx:{topic:'',people:[]}},
    {pid:'mi',accountId:'gmail-p',ic:'',fm:'小米商城',tag:'邮件',subj:'发票开具成功：12678934501',prev:'您的电子发票已开具，请查收附件。',tm:'3天前',st:'2026-07-17T09:00',ch:'Gmail',body:'尊敬的用户，\n\n您的订单 12678934501 电子发票已开具。\n\n发票金额：¥6,499.00\n发票类型：电子普通发票\n\n发票详情请查看附件。\n\n小米商城',at:['invoice_12678934501.pdf'],fl:'',ctx:{topic:'',people:[]}},

    // 妈妈 - personal
    {pid:'mom',accountId:'wechat',ic:'',fm:'妈妈',tag:'微信',subj:'周末回来吃饭吗',prev:'你爸买了你爱吃的虾，周六晚上回来吗？',tm:'昨天',st:'2026-07-19T18:30',ch:'WeChat',body:'周末回来吃饭吗？你爸今天去市场买了虾，说你好久没回来了。',at:[],fl:'',ctx:{topic:'',people:[]}},

    // 王猎头 - recruiter
    {pid:'rec',accountId:'gmail-p',ic:'',fm:'王猎头',tag:'邮件',subj:'推荐：某头部 AI 公司技术负责人（年薪 200-300w）',prev:'Edwin 好，有家头部 AI 公司在招技术负责人， base 北京，觉得您背景很匹配。',tm:'2周前',st:'2026-07-06T10:00',ch:'Gmail',body:'Edwin 您好，\n\n我是猎聘网高级顾问王敏。近期服务的一家头部 AI 公司正在招募技术负责人，负责一款面向开发者的智能助手产品。\n\n岗位要求：\n- 10 年以上研发经验，3 年以上技术管理经验\n- 有 AI/LLM 产品落地经验优先\n- 年薪范围 200-300w，可谈期权\n\n如果您有兴趣，可以加微信详聊。如果暂时不考虑，也欢迎推荐身边合适的朋友。\n\n祝好，\n王敏',at:[],fl:'',ctx:{topic:'',people:[]}},

    // Lenny's Newsletter
    {pid:'nw2',accountId:'gmail-p',ic:'',fm:'Lenny\'s Newsletter',tag:'邮件',subj:'How the best product teams build conviction',prev:'This week: how top PMs use prototyping, user research, and metrics to make decisions without endless debate.',tm:'4天前',st:'2026-07-16T08:00',ch:'Gmail',body:'Hi friend,\n\nThis week I spoke with product leaders at Figma, Notion, and Linear about how they build conviction before committing engineering resources.\n\nThree patterns stood out:\n\n1. They prototype in hours, not weeks.\n2. They bias toward live user interviews over survey data.\n3. They write a short "decision memo" before any major bet.\n\nRead the full essay below.\n\n— Lenny',at:[],fl:'',ctx:{topic:'',people:[]}},

    // Full bodies for existing key threads
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'张磊',tag:'邮件',subj:'Re: Q4 合同提案',prev:'收到，有几个条款需要对齐：付款节奏、交付物定义和违约责任。',tm:'1天前',st:'2026-07-17T11:20',ch:'Gmail',body:'Edwin，\n\n合同初稿已经让法务看过，整体方向没问题，有三个条款需要我们对齐：\n\n1. 付款节奏：建议从 40-30-30 调整为 30-40-30，尾款在终验后 15 个工作日内支付。\n2. 交付物定义：需要把「验收报告」和「源代码交付清单」明确写进附件。\n3. 违约责任：延迟交付的罚金上限建议设为合同总额的 8%，而不是 10%。\n\n你这边什么意见？我们明天会上过一下。\n\n张磊\n战略合作总监 | 华为',at:[],fl:'wait',ctx:{topic:'Q4合同',people:[]}},
    {pid:'zl',accountId:'gmail-w',ic:'',fm:'你',tag:'邮件',subj:'Re: Q4 合同提案',prev:'付款节奏可以按 30-40-30 调整，交付物验收标准我附在文档里了。',tm:'1天前',st:'2026-07-17T18:00',ch:'Gmail',body:'张磊，\n\n感谢反馈，回复如下：\n\n1. 付款节奏同意按 30-40-30 调整。\n2. 交付物定义已补充在附件 v3 中，验收标准细化到 3 个里程碑。\n3. 违约金上限我们建议保持 10%，但可以增加「不可抗力」免责条款。\n\n请查收附件，明天会上我们逐条确认。\n\nBest,\nEdwin',at:['Q4_Proposal_v3.pdf'],fl:'done',ctx:{topic:'Q4合同',people:[]}},
    {pid:'cx',accountId:'gmail-w',ic:'',fm:'陈欣',tag:'邮件',subj:'Re: 合作 - Q3回顾 & Q4规划',prev:'Q4里程碑一致。整合阶段能提前两周吗？我们需要再评估资源。',tm:'1小时前',st:'2026-07-18T10:30',ch:'Gmail',body:'Edwin，\n\nQ4 里程碑我们对齐了，整体 OK。\n\n关于整合阶段提前两周：我们内部初步评估了一下，风险主要在两点——\n\n1. API 兼容性测试时间会被压缩；\n2. 联调窗口和另一个重点项目冲突。\n\n能否周三前给我们一个详细的风险评估？如果可控，我们愿意配合压缩。\n\n陈欣\n战略合作经理 | 字节跳动',at:[],fl:'todo',ctx:{topic:'Q4规划',people:['zl']}},
    {pid:'sj',accountId:'slack',ic:'',fm:'孙静',tag:'Slack',subj:'#project-alpha: 周五部署',prev:'@Edwin 请先 review 测试计划，周四前给我反馈。',tm:'5小时前',st:'2026-07-18T06:30',ch:'Slack',body:'@Edwin 周五部署的测试计划已经上传到 Slack，请先 review。重点关注支付模块的回归用例和性能基线。周四前给我反馈，没问题的话我们周五上午 10 点准时部署。',at:[],fl:'todo',ctx:{topic:'项目部署',people:[]}},
  ],
  _files:[
    {id:'f1',pid:'zl',name:'Q4_Proposal_v3.pdf',tp:'pdf',sz:'2.4 MB',dt:'2026-07-16',ch:'Gmail',md:'# Q4 合同提案 v3\n\n## 主要变更\n- 付款条款调整为 30-40-30\n- 交付物验收标准细化到 3 个里程碑\n- 违约责任按延迟周数阶梯计算\n\n## 关键数字\n- 合同总额：¥2,400,000\n- 交付周期：12 周\n- 维护期：6 个月'},
    {id:'f2',pid:'cx',name:'Q3_Review.pdf',tp:'pdf',sz:'1.8 MB',dt:'2026-07-17',ch:'Gmail',md:'# Q3 合作复盘\n\n## 达成项\n- API 调用量增长 34%\n- 联合方案落地 2 家客户\n- 客户满意度 4.6/5\n\n## 待改进\n- 响应时效仍需压缩\n- 文档交付标准化'},
    {id:'f3',pid:'cx',name:'Q4_Plan.docx',tp:'doc',sz:'856 KB',dt:'2026-07-17',ch:'Gmail',md:'# Q4 合作规划\n\n## 里程碑\n1. 10/15 完成技术对接\n2. 11/01 启动联合推广\n3. 12/20 年度复盘\n\n## 资源需求\n- 产品经理 0.5 FTE\n- 技术支持 1 FTE'},
    {id:'f4',pid:'wy',name:'Q4_Cooperation_Proposal.pdf',tp:'pdf',sz:'3.2 MB',dt:'2026-06-03',ch:'Gmail',md:'# Q4 合作提案\n\n## 合作方向\n- 联合市场活动 3 场\n- 产品集成功能 2 项\n- 客户共创案例 1 个\n\n## 预算\n- 总预算：¥1,800,000\n- 预期 ROI：3.2x'},
    {id:'f5',pid:'lc',name:'Tech_Partnership_v1.pdf',tp:'pdf',sz:'1.5 MB',dt:'2026-05-16',ch:'Gmail',md:'# 技术合作方案 v1\n\n## 技术对接\n- 统一账号体系\n- 数据互通协议\n- 联合安全审计\n\n## 实施周期\n- POC：4 周\n- 正式上线：10 周'},
    {id:'f6',pid:'sj',name:'Invoice_1024.pdf',tp:'pdf',sz:'412 KB',dt:'2026-07-17',ch:'Gmail',md:'# 发票 #1024\n\n- 服务期间：2026 Q3\n- 金额：¥68,000\n- 付款期限：30 天\n- 发票状态：已发送'},
    {id:'f7',pid:'xm',name:'Supply_Chain_Q3.pdf',tp:'pdf',sz:'4.1 MB',dt:'2026-07-17',ch:'Gmail',md:'# Q3 供应链评估报告\n\n## 总体评级：A-\n\n## 问题项\n1. 交付准时率 87%（目标 92%）\n2. 库存周转天数 45 天\n3. 质量投诉 2 起\n\n## 建议\n- 优化供应商排产计划\n- 增加安全库存缓冲'},
    {id:'f8',pid:'zw',name:'Q3_Marketing_Calendar.xlsx',tp:'spreadsheet',sz:'632 KB',dt:'2026-07-13',ch:'Gmail',md:'# Q3 市场活动排期\n\n| 日期 | 活动 | 负责人 | 状态 |\n|---|---|---|---|\n| 7/15 | 线上发布会 | 赵薇 | 完成 |\n| 8/05 | 联合直播 | 市场组 | 准备中 |\n| 8/20 | 客户沙龙 | 销售组 | 待定 |'},
    {id:'f9',pid:'zl',name:'Contract_Template_v2.docx',tp:'doc',sz:'224 KB',dt:'2026-07-10',ch:'Gmail',md:'# 合同模板 v2\n\n## 主要条款\n1. 保密义务\n2. 知识产权归属\n3. 违约责任\n4. 争议解决\n\n*本模板仅供内部使用*'},
    {id:'f10',pid:'cx',name:'Partnership_Agreement.pdf',tp:'pdf',sz:'1.1 MB',dt:'2026-07-05',ch:'Gmail',md:'# 合作协议\n\n## 合作范围\n- 产品联合开发\n- 市场联合推广\n- 客户资源共享\n\n## 有效期\n2026-07-01 至 2028-06-30'},
    {id:'f11',pid:'zl',name:'Meeting_Photo_0720.jpg',tp:'image',sz:'3.8 MB',dt:'2026-07-20',ch:'WeChat'},
    {id:'f12',pid:'lc',name:'Architecture_Diagram.png',tp:'image',sz:'2.1 MB',dt:'2026-05-16',ch:'Gmail'},
    {id:'f13',pid:'yy',name:'Co_Branding_Proposal.pdf',tp:'pdf',sz:'4.5 MB',dt:'2026-07-13',ch:'Gmail',md:'# 联名活动方案\n\n## 活动主题\n「夏日焕新」\n\n## 资源投入\n- 小红书：开屏 + KOL 10 位\n- 我方：产品礼包 500 份\n\n## 目标\n- 曝光 500W\n- 互动 5W\n- 转化 2000 单'},
    {id:'f14',pid:'sj',name:'Test_Plan_Alpha.xlsx',tp:'spreadsheet',sz:'520 KB',dt:'2026-07-15',ch:'Slack',md:'# Alpha 测试计划\n\n| 模块 | 负责人 | 用例数 | 状态 |\n|---|---|---|---|\n| 登录 | 张三 | 12 | 通过 |\n| 支付 | 李四 | 18 | 进行中 |\n| 报表 | 王五 | 8 | 待开始 |'},
    {id:'f15',pid:'xm',name:'Supply_Chain_Review.pptx',tp:'doc',sz:'8.2 MB',dt:'2026-07-17',ch:'Gmail',md:'# 供应链评审会 PPT\n\n## 议程\n1. Q3 数据回顾\n2. 问题项讨论\n3. Q4 改进计划\n4. 责任人确认\n\n## 关键结论\n- 交付准时率需提升至 92%\n- 新增 2 家备用供应商'},
    {id:'f16',pid:'cx',name:'API_Changes_Diff.md',tp:'doc',sz:'32 KB',dt:'2026-07-17',ch:'Slack',md:'# API 变更 Diff\n\n## Breaking Changes\n- `GET /v1/orders` 废弃，改用 `GET /v2/orders`\n- 字段 `customer_id` 重命名为 `user_id`\n\n## Migration\n1. 更新 endpoint\n2. 替换字段名\n3. 回归测试'},
    {id:'f17',pid:'lh',name:'AI_Project_Phase1_Report.pdf',tp:'pdf',sz:'2.9 MB',dt:'2026-06-18',ch:'Gmail',md:'# AI 项目一期验收报告\n\n## 验收结果\n- 功能完成度：100%\n- 性能指标：达标\n- 文档完整度：90%\n\n## 遗留项\n- 模型可解释性文档待补充\n- 二期范围待确认'},
    {id:'f18',pid:'zw',name:'Marketing_Assets.zip',tp:'doc',sz:'24 MB',dt:'2026-07-15',ch:'Gmail'},
  ],
  _meetings:[
    {id:'m1',title:'Q4合同评审',pids:['zl'],ppl:'张磊',dt:'明天 7/19',tm:'14:00-15:00',br:true,notes:'合同条款最终确认',prep:['阅读张磊最新邮件','确认付款条款修改','准备3份附件'],agenda:['上次合同要点回顾','本次调整条款说明','付款节奏与违约责任确认','下一步行动项'],actionItems:[{id:'ai-m1-1',title:'张磊内部走合同审批',owner:'张磊',due:'7/22',done:false}],materials:['f1','f9'],post:''},
    {id:'m2',title:'API变更对齐',pids:['cx'],ppl:'陈欣 + 技术团队',dt:'周四 7/24',tm:'15:00-16:00',br:true,notes:'API版本升级方案',prep:['查看陈欣Slack消息','准备API差异文档'],agenda:['当前API限制回顾','v2 升级方案','向后兼容策略','迁移时间表'],actionItems:[],materials:[],post:''},
    {id:'m3',title:'AI项目验收',pids:['lh'],ppl:'刘华 + 百度团队',dt:'下周二 7/22',tm:'10:00-11:30',br:false,notes:'一期验收+二期规划',prep:['回顾项目方案','准备验收清单'],agenda:['一期交付物逐项 review','技术指标验收','二期预算对齐','下一步合作模式'],actionItems:[],materials:[],post:''},
    {id:'m4',title:'供应链评审会',pids:['xm'],ppl:'谢明 + 采购团队',dt:'明天 7/19',tm:'09:30-10:30',br:true,notes:'Q3供应链评估review',prep:['阅读Q3报告','标注问题项'],agenda:['Q3 评分回顾','问题项讨论','Q4 优化计划'],actionItems:[{id:'ai-m4-1',title:'修订交付排产计划',owner:'谢明',due:'7/26',done:false}],materials:['f7'],post:'已生成纪要，待确认'},
    {id:'m5',title:'联名活动创意会',pids:['yy'],ppl:'杨雨 + 市场团队',dt:'下周 7/23',tm:'14:00-15:00',br:false,notes:'创意方向对齐',prep:['回顾联名方案','收集竞品案例'],agenda:['方案核心创意回顾','预算压力点讨论','下一步执行节奏'],actionItems:[],materials:[],post:''},
    {id:'m6',title:'Q3合作复盘',pids:['cx','zl'],ppl:'陈欣 + 张磊',dt:'已结束 7/15',tm:'14:00-15:30',br:true,notes:'Q3复盘已完成',prep:[],agenda:[],actionItems:[{id:'ai-m6-1',title:'发送Q4规划',owner:'我',due:'7/17',done:true}],materials:[],post:'纪要已生成 - Action: 发送Q4规划'},
  ],
  agentTasks:[
    {id:'at-1',name:'Q4 跟进方案',sessionId:'as-task-1',status:'go',steps:[{l:'分析王洋邮件历史',d:true},{l:'起草跟进邮件',d:true},{l:'等待你的审批',d:false}],eta:'2 min',createdAt:Date.now()-3600000},
    {id:'at-2',name:'本周沟通总结',sessionId:'as-task-2',status:'go',steps:[{l:'收集47条消息',d:true},{l:'跨渠道分析',d:true},{l:'生成报告',d:false}],eta:'5 min',createdAt:Date.now()-7200000},
    {id:'at-3',name:'激活李晨关系',sessionId:'as-task-3',status:'wt',steps:[{l:'分析冷淡原因',d:true},{l:'建议联系策略',d:true},{l:'等待你批准',d:false}],eta:'1 min',createdAt:Date.now()-1800000},
  ],
  agentDrafts:[
    {id:'d1',to:'王洋',subj:'Re: Q4 合作提案',preview:'Hi 王洋，希望一切顺利。之前发您的Q4提案，想了解一下内部对齐的进展。不知下周是否有空通个电话？',v:1,source:'agent'},
    {id:'d2',to:'陈欣',subj:'Re: 合作 - Q3回顾 & Q4规划',preview:'Hi 陈欣，好的，我安排技术负责人周四下午同步API变更方案。关于整合阶段提前两周，我周三前给您答复。',v:1,source:'agent'},
  ],
  drafts:[
    {id:'md1',from:'gmail-w',to:'张磊',cc:'',bcc:'',subj:'Q4 合同补充说明',body:'张磊，\n\n关于昨天讨论的验收标准，我补充几点：\n\n1. 性能指标以附件 v3 为准\n2. 违约金上限保持 10%，但增加不可抗力免责\n3. 尾款支付周期从 15 个工作日延长至 20 个\n\n请确认是否可接受。',at:[],source:'manual',createdAt:Date.now()-86400000,updatedAt:Date.now()-3600000,linkedSession:null,linkedTask:null}
  ],
  agentCompleted:[
    {name:'张磊会议简报',saved:'8 min'},{name:'孙静测试总结',saved:'5 min'},
    {name:'归档周报',saved:'3 min'},{name:'提醒李晨风险',saved:'-'},
  ],
  agentAuditLog:[
    {id:'a1',action:'draft',target:'王洋',detail:'起草了 Q4 跟进邮件',ref:'d1',status:'pending_approval',time:'10:32',st:'2026-07-20T10:32',undoable:true,risk:'high'},
    {id:'a2',action:'summarize',target:'张磊',detail:'生成了会议简报（Q4合同评审）',ref:'m1',status:'completed',time:'09:15',st:'2026-07-20T09:15',undoable:true,risk:'low'},
    {id:'a3',action:'analyze',target:'李晨',detail:'分析了关系冷淡原因 - 62天未联系',ref:'lc',status:'completed',time:'昨天',st:'2026-07-19T12:00',undoable:false,risk:'low'},
    {id:'a4',action:'remind',target:'王洋',detail:'发送了跟进提醒（45天未联系）',ref:'wy',status:'completed',time:'2小时前',st:'2026-07-20T10:00',undoable:false,risk:'low'},
    {id:'a5',action:'draft',target:'陈欣',detail:'起草了 Q4 规划回复',ref:'d2',status:'pending_approval',time:'09:15',st:'2026-07-20T09:15',undoable:true,risk:'high'},
    {id:'a6',action:'send',target:'孙静',detail:'回复了测试计划确认',ref:'sj',status:'sent',time:'昨天 16:20',st:'2026-07-19T16:20',undoable:false,risk:'high'},
  ],
  notifications:[
    {txt:'<strong>王洋</strong> 已45天未联系，建议跟进',tm:'2小时前',read:false},
    {txt:'<strong>SendPalm</strong> 张磊会议简报已生成',tm:'3小时前',read:false},
    {txt:'<strong>2份草稿</strong> 等待审批',tm:'5小时前',read:false},
    {txt:'<strong>李晨</strong> 关系冷淡（62天），建议激活',tm:'昨天',read:true},
    {txt:'<strong>Outlook</strong> 令牌过期，请重新认证',tm:'2天前',read:true},
  ],
  contextLinks:{
    'Q4合同':{people:['zl','cx'],files:['f1','f9','f10'],meetings:['m1']},
    '付款条款':{people:['zl','wy'],files:['f4'],meetings:[]},
    'Q4规划':{people:['cx','zl'],files:['f2','f3'],meetings:['m6']},
    'API升级':{people:['cx'],files:['f16'],meetings:['m2']},
    'AI项目':{people:['lc','lh'],files:['f5','f12','f17'],meetings:['m3']},
    '项目部署':{people:['sj'],files:['f14'],meetings:[]},
    '联名活动':{people:['yy'],files:['f13'],meetings:['m5']},
    '供应链评估':{people:['xm'],files:['f7','f15'],meetings:['m4']},
    'Q3市场活动':{people:['zw'],files:['f8','f18'],meetings:[]},
  },
  labels:[
    {id:'l-work',name:'Work',color:'#3b82f6'},
    {id:'l-personal',name:'Personal',color:'#22c55e'},
    {id:'l-finance',name:'Finance',color:'#f59e0b'},
    {id:'l-travel',name:'Travel',color:'#8b5cf6'},
    {id:'l-receipts',name:'Receipts',color:'#ef4444'},
    {id:'l-newsletters',name:'Newsletters',color:'#06b6d4'}
  ],
  calendarExtras:{
    dayLabels:{
      '2026-07-18':'放松日',
      '2026-07-19':'评审密集日',
      '2026-07-22':'产品发布日',
      '2026-07-25':'周末远足',
    },
    dayPhotos:{
      '2026-07-18':'#fde68a',
      '2026-07-19':'#fca5a5',
      '2026-07-22':'#a7f3d0',
    },
    dayCircled:{
      '2026-07-22':true,
    },
    sometime:[
      {id:'st1',title:'给车换机油',estMin:60,added:'2026-07-15'},
      {id:'st2',title:'给爸妈打电话',estMin:30,added:'2026-07-16'},
      {id:'st3',title:'读《如何阅读一本书》第二章',estMin:45,added:'2026-07-17'},
      {id:'st4',title:'整理 Q4 OKR 草稿',estMin:90,added:'2026-07-18'},
    ],
    habits:[
      {id:'h1',title:'晨跑',icon:'ph-person-simple-run',color:'mint',days:{1:true,2:true,3:true,4:false,5:true,6:false,0:true}},
      {id:'h2',title:'冥想 10 分钟',icon:'ph-lotus',color:'lavender',days:{1:true,2:true,3:true,4:true,5:true,6:false,0:true}},
      {id:'h3',title:'写日记',icon:'ph-notebook',color:'canary',days:{1:false,2:true,3:true,4:true,5:true,6:false,0:false}},
      {id:'h4',title:'阅读 30 分钟',icon:'ph-book-open',color:'sky',days:{1:true,2:true,3:false,4:true,5:true,6:true,0:false}},
    ],
    timeTracking:[
      {date:'2026-07-20',minutes:120,category:'深度工作',icon:'ph-laptop',note:'写 Q4 规划'},
      {date:'2026-07-20',minutes:30,category:'会议',icon:'ph-users',note:'周会'},
      {date:'2026-07-20',minutes:45,category:'阅读',icon:'ph-book-open',note:'行业新闻'},
      {date:'2026-07-19',minutes:90,category:'深度工作',icon:'ph-laptop',note:'API 设计'},
      {date:'2026-07-19',minutes:60,category:'评审',icon:'ph-clipboard-text',note:'Q3 复盘'},
      {date:'2026-07-22',minutes:150,category:'深度工作',icon:'ph-laptop',note:'AI 模型调优'},
    ],
    multiDayEvents:[
      {id:'md1',title:'团队外出 (杭州)',start:'2026-07-23',end:'2026-07-25',color:'peach'},
      {id:'md2',title:'AI 模型训练',start:'2026-07-21',end:'2026-07-23',color:'sky'},
      {id:'md3',title:'产品封闭开发',start:'2026-08-03',end:'2026-08-09',color:'mint'},
      {id:'md4',title:'中秋假期',start:'2026-09-15',end:'2026-09-17',color:'canary'},
      {id:'md5',title:'年度复盘',start:'2026-12-28',end:'2026-12-31',color:'lavender'},
    ],
  },
  appSettings:{
    security:{lockEnabled:true,lockType:'pin',lockTimeout:5,screenshot:true,clipboardClear:true,autoLock:true},
    notifications:{quietHours:{enabled:true,start:'22:00',end:'08:00'},priority:'all',desktop:true,weeklyDigest:false},
    agent:{autoApproval:'low-risk',undoTimeout:10,confidenceThreshold:0.8},
    syncFormat:'markdown',
  },
  onboarding:{
    completed:false
  }
};

// --- HEY-style normalization: defaults + lightweight classification ---
(function normalizeData() {
  // Default contact routing + new-shape migration/backwards-compat aliases
  D.contacts.forEach(c => {
    if (c.blocked === undefined) c.blocked = false;
    if (c.notify === undefined) c.notify = true;
    if (c.firstSeen === undefined) c.firstSeen = false;
    if (c.screened === undefined) c.screened = true;
    if (c.defaultBucket === undefined) {
      // Cold contacts stay in Imbox but low priority; newsletters would go to Feed
      c.defaultBucket = 'imbox';
    }
    if (c.autoLabel === undefined) c.autoLabel = [];
    if (c.recycling === undefined) c.recycling = false;

    // Rich contact shape (Task 1)
    if (c.firstName === undefined) c.firstName = '';
    if (c.lastName === undefined) c.lastName = '';
    if (c.nickname === undefined) c.nickname = '';
    if (c.company === undefined) c.company = c.co || '';
    if (c.title === undefined) c.title = c.tl || '';
    if (!Array.isArray(c.emails)) c.emails = c.em ? [{ value: c.em, label: 'work' }] : [];
    if (!Array.isArray(c.phones)) c.phones = c.ph ? [{ value: c.ph, label: 'work' }] : [];
    if (!c.stage) c.stage = 'explore';
    if (!Array.isArray(c.labels)) c.labels = [];
    if (!Array.isArray(c.topics)) c.topics = [];
    if (c.notes === undefined) c.notes = '';
    if (!c.avatar && c.photo) c.avatar = c.photo;

    // Keep name as computed cache for existing renderers
    if (!c.name) {
      const isChinese = (s) => /^[\u4e00-\u9fa5]+$/.test(s || '');
      if (c.firstName && c.lastName && isChinese(c.firstName) && isChinese(c.lastName)) {
        c.name = c.lastName + c.firstName;
      } else {
        c.name = (c.firstName + ' ' + c.lastName).trim() || c.nickname || c.company || 'Unnamed';
      }
    }

    // Backwards-compatible aliases used by existing renderers
    c.co = c.company;
    c.tl = c.title;
    c.em = c.emails[0] ? c.emails[0].value : '';
    c.ph = c.phones[0] ? c.phones[0].value : '';
    c.photo = c.avatar;
  });

  // Add a couple of unknown first-time senders for the Screener demo
  const unknownSenders = [
    { id:'unk1', firstName:'新锐', lastName:'李', nickname:'', company:'未知公司', title:'商务拓展', emails:[{value:'lixinrui@example.com',label:'work'}], phones:[], stage:'explore', labels:[], topics:[], notes:'', firstSeen:true, screened:false, defaultBucket:null, notify:false, blocked:false },
    { id:'unk2', firstName:'Product', lastName:'Hunt', nickname:'', company:'Product Hunt', title:'', emails:[{value:'noreply@producthunt.com',label:'work'}], phones:[], stage:'explore', labels:[], topics:[], notes:'', firstSeen:true, screened:false, defaultBucket:null, notify:false, blocked:false },
  ];
  unknownSenders.forEach(u => {
    if (!D.getP(u.id)) D.contacts.push(u);
  });

  // Ensure aliases are set for newly added senders too
  D.contacts.forEach(c => {
    if (!c.name) {
      const isChinese = (s) => /^[\u4e00-\u9fa5]+$/.test(s || '');
      if (c.firstName && c.lastName && isChinese(c.firstName) && isChinese(c.lastName)) {
        c.name = c.lastName + c.firstName;
      } else {
        c.name = (c.firstName + ' ' + c.lastName).trim() || c.nickname || c.company || 'Unnamed';
      }
    }
    c.co = c.company;
    c.tl = c.title;
    c.em = c.emails && c.emails[0] ? c.emails[0].value : '';
    c.ph = c.phones && c.phones[0] ? c.phones[0].value : '';
    c.photo = c.avatar;
  });

  // Screener messages from unknown senders
  D._msgs.push(
    {pid:'unk1',accountId:'gmail-w',ic:'',fm:'李新锐',tag:'邮件',subj:'合作邀约：AI 助手集成',prev:'Hi，看到 SendPalm 的产品方向，想探讨一下 AI 助手集成的可能性。',tm:'1小时前',st:'2026-07-20T09:30',ch:'Gmail',at:[],fl:''},
    {pid:'unk2',accountId:'gmail-p',ic:'',fm:'Product Hunt',tag:'邮件',subj:'Your product is trending',prev:'Congratulations! Your launch is now #3 in AI Tools.',tm:'3小时前',st:'2026-07-20T07:15',ch:'Gmail',at:[],fl:''}
  );

  // Default message flags and bucket inference
  const paperTrailKeywords = /receipt|invoice|order|验证码|verification|notification|提醒|归档|周报|发票|系统|calendar|日历/i;
  const feedKeywords = /newsletter|digest|update|unsubscribe|订阅|推广|营销|trending/i;

  D._msgs.forEach(m => {
    if (m.bucket === undefined) {
      const contact = D.getP(m.pid);
      if (m.fm === '系统' || m.ch === 'Calendar' || (m.tag && /日历/.test(m.tag))) {
        m.bucket = 'paperTrail';
      } else if (paperTrailKeywords.test(m.subj + ' ' + m.prev)) {
        m.bucket = 'paperTrail';
      } else if (feedKeywords.test(m.subj + ' ' + m.prev) || (contact && contact.grp === 'cold' && m.fm !== '你')) {
        m.bucket = 'feed';
      } else {
        m.bucket = contact && contact.defaultBucket ? contact.defaultBucket : 'imbox';
      }
    }
    if (m.screened === undefined) m.screened = true;
    if (m.blocked === undefined) m.blocked = false;
    if (m.replyLater === undefined) m.replyLater = false;
    if (m.setAside === undefined) m.setAside = false;
    if (m.bubbleUpUntil === undefined) m.bubbleUpUntil = null;
    if (m.seen === undefined) m.seen = false;
  });

  // Mark older messages as already seen so Imbox shows New For You / Previously Seen
  const appNow = new Date('2026-07-20T12:00:00').getTime();
  D._msgs.forEach(m => {
    const msgTime = new Date(m.st).getTime() || appNow;
    if (!isNaN(msgTime) && (appNow - msgTime) > 2 * 24 * 60 * 60 * 1000) {
      m.seen = true;
    }
  });

  // Seed a few workflow examples
  const seedWorkflow = (pid, subj, flag, due) => {
    const msg = D._msgs.find(m => m.pid === pid && m.subj.includes(subj));
    if (msg) {
      if (flag === 'replyLater') msg.replyLater = true;
      if (flag === 'setAside') msg.setAside = true;
      if (flag === 'bubbleUp') msg.bubbleUpUntil = due;
    }
  };
  seedWorkflow('wy', 'Q4 合作提案', 'replyLater');
  seedWorkflow('sj', '发票 #1024', 'setAside');
  seedWorkflow('lh', 'AI 合作项目更新', 'bubbleUp', '2026-07-22T09:00');
})();

window.D = window.D || {};
D.agentSessions = [
  {
    id: 'as-1',
    type: 'contextual',
    title: '张磊合同跟进',
    context: { kind: 'message', id: 'msg-1', preview: '张磊 - 合同附件 - 验收标准 v2' },
    messages: [
      { role: 'user', text: '帮我草拟回复', ts: Date.now() - 3600000 },
      { role: 'agent', text: '好的，我已根据合同附件为你草拟回复：\n\n张磊，\n\n验收标准 v2 已收到...', actions: ['copy', 'regenerate', 'use-draft'], ts: Date.now() - 3500000 }
    ],
    taskId: null,
    memoryTags: ['formal-tone'],
    status: 'active',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3500000
  },
  {
    id: 'as-2',
    type: 'freeform',
    title: '我的写作风格',
    context: { kind: null, id: null, preview: '' },
    messages: [
      { role: 'user', text: '我喜欢正式的邮件语气', ts: Date.now() - 86400000 },
      { role: 'agent', text: '已记录：你偏好正式语气。后续草稿会默认采用正式表达。', actions: [], ts: Date.now() - 86300000 }
    ],
    taskId: null,
    memoryTags: ['preference-tone-formal'],
    status: 'pinned',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86300000
  }
];

D.agentMemory = {
  global: {
    tone: 'formal',
    defaultLength: 'medium',
    signature: 'Best, Edwin',
    language: 'zh-CN'
  },
  contacts: {
    'p-1': {
      topics: ['Q4合同', '付款条款'],
      preferences: ['喜欢数据驱动', '回复慢但决策快'],
      avoid: ['不要在周五下午发邮件']
    }
  }
};

// Task 14: customizable keyboard shortcuts.
D.shortcuts = [
  { id: 'new-message', action: 'New message', key: 'n', modifier: 'cmd' },
  { id: 'search', action: 'Search', key: '/' },
  { id: 'command-palette', action: 'Command palette', key: 'k', modifier: 'cmd' },
  { id: 'shortcuts-help', action: 'Shortcuts help', key: '?' },

  { id: 'nav-gate', action: 'Go to Gate', key: '1', modifier: 'cmd' },
  { id: 'nav-inbox', action: 'Go to Inbox', key: '2', modifier: 'cmd' },
  { id: 'nav-stream', action: 'Go to Stream', key: '3', modifier: 'cmd' },
  { id: 'nav-records', action: 'Go to Records', key: '4', modifier: 'cmd' },
  { id: 'nav-contacts', action: 'Go to Contacts', key: '5', modifier: 'cmd' },
  { id: 'nav-calendar', action: 'Go to Calendar', key: '6', modifier: 'cmd' },
  { id: 'nav-files', action: 'Go to Files', key: '7', modifier: 'cmd' },
  { id: 'nav-insights', action: 'Go to Insights', key: '8', modifier: 'cmd' },
  { id: 'nav-agent', action: 'Go to Agent', key: '9', modifier: 'cmd' },

  { id: 'inbox-seq', action: 'Inbox (sequence)', key: 'g i' },
  { id: 'stream-seq', action: 'Stream (sequence)', key: 'g s' },
  { id: 'records-seq', action: 'Records (sequence)', key: 'g r' },
  { id: 'contacts-seq', action: 'Contacts (sequence)', key: 'g c' },
  { id: 'calendar-seq', action: 'Calendar (sequence)', key: 'g d' },

  { id: 'calendar-day', action: 'Calendar day view', key: 'd' },
  { id: 'calendar-week', action: 'Calendar week view', key: 'w' },
  { id: 'calendar-year', action: 'Calendar year view', key: 'y' },
  { id: 'calendar-today', action: 'Calendar today', key: 't' },
  { id: 'calendar-prev', action: 'Calendar previous day', key: 'ArrowLeft' },
  { id: 'calendar-next', action: 'Calendar next day', key: 'ArrowRight' },

  { id: 'list-next', action: 'Next item', key: 'j' },
  { id: 'list-prev', action: 'Previous item', key: 'k' },
  { id: 'list-open', action: 'Open selected', key: 'Enter' },
  { id: 'list-select', action: 'Select item', key: 'x' },
  { id: 'list-bulk', action: 'Bulk actions', key: ';' },

  { id: 'msg-archive', action: 'Archive message', key: 'e' },
  { id: 'msg-reply', action: 'Reply to message', key: 'r' },
  { id: 'msg-pending', action: 'Move to Pending', key: 'l' },
  { id: 'msg-save', action: 'Save message', key: 's' },
  { id: 'msg-remind', action: 'Remind tomorrow', key: 'b' },
  { id: 'msg-unread', action: 'Toggle read/unread', key: 'u' },
  { id: 'msg-trash', action: 'Move to Trash', key: '#' },
  { id: 'msg-spam', action: 'Mark as spam', key: '!' }
];

// Backwards-compatible top-level alias for older prototype versions.
const accounts = D.accounts;

// Notification center (P4 Task B). Seed entries so the bell shows real-looking content.
D.notifications = [
  { id: 'n1', type: 'remind', title: '3 messages bubbled up', body: '张磊 · Re: Q4 合同提案 +2 more', at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), read: false, ref: { view: 'bubbleUp' } },
  { id: 'n2', type: 'followup', title: '王洋 已 45 天未联系', body: '建议下周电话跟进', at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), read: false, ref: { view: 'contacts', contactId: 'wy' } },
  { id: 'n3', type: 'draft', title: '2 份草稿等待审批', body: 'Agent 起草：给张磊的 Q4 合同回复', at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), read: false, ref: { view: 'drafts' } },
  { id: 'n4', type: 'agent', title: '会议简报已生成', body: '明天 14:00 Q4 合同评审会议', at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), read: true, ref: { view: 'calendar' } },
  { id: 'n5', type: 'replylater', title: 'Pending 里有 1 封待回复', body: '陈欣 · Re: 合作 - Q3回顾', at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), read: true, ref: { view: 'replyLater' } },
  { id: 'n6', type: 'mention', title: 'Lisa Park @ 你', body: 'Figma 设计系统更新 ready for review', at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), read: true, ref: { view: 'contacts', contactId: 'lp' } },
];
D.notificationLastSeenAt = localStorage.getItem('sendpalm-notif-last-seen') || null;

// 扩展现有任务和草稿，增加 sessionId 字段
if (D.agentTasks && D.agentTasks.length) {
  D.agentTasks.forEach((t, i) => {
    if (!t.sessionId) t.sessionId = 'as-task-' + (i + 1);
  });
}
if (D.agentDrafts && D.agentDrafts.length) {
  D.agentDrafts.forEach((d, i) => {
    if (!d.sessionId) d.sessionId = 'as-draft-' + (i + 1);
    if (!d.sourceContext) d.sourceContext = { kind: 'message', id: 'msg-' + i, preview: d.to + ' - ' + d.subj };
    if (!d.source) d.source = 'agent';
  });
}
D.drafts = D.drafts || [];

