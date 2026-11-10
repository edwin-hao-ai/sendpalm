import { test, expect } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";
const now = new Date().toISOString();
function a(): Account { return { id:"acct-a",type:"email",provider:"custom",email:"work@example.com",label:"work",displayName:"w",status:"connected",synced:0,total:0,privacy:"unified",color:"#0a8f63",avatar:"",lastSync:now,settings:{aliases:[],signature:"",replyTo:"",defaultFrom:"work@example.com",syncFolders:[],syncFrequency:"manual",autoBcc:false,autoBccAddress:"",vacationResponder:{enabled:false,subject:"",body:""}}} as Account; }
function c(): Contact { return { id:"c1",firstName:"Hilton",lastName:"Honors",nickname:"",name:"Hilton Honors",company:"",title:"",emails:[{value:"h@x.com",label:"work"}],phones:[],stage:"active",labels:[],topics:[],notes:"",avatar:"",photo:"",health:70,sc:0,scC:"",scL:"",lc:"",grp:"",trd:"stable",pattern:"",accounts:[],stageHistory:[],firstContact:now,milestones:[],merged:false,blocked:false,notify:false,firstSeen:false,screened:true,defaultBucket:"feed",autoLabel:[],recycling:false,ch:[]} as Contact; }
function m(): Message { return { id:"f1",pid:"c1",subj:"Newsletter",prev:"hi",body:"hi",bodyHtml:"<div><img src=\"https://example.com/hero.png\" alt=\"hero\"><p>hello newsletter</p></div>",tm:"10:00",st:now,ac:"acct-a",bucket:"feed",direction:"in",unread:false,labels:[],attachments:[],trackers:[],replyLater:false,setAside:false,bubbleUpAt:null,remindAt:null,deletedAt:null,to:"me@x.com",cc:[],bcc:[],threadId:undefined,calendarInvite:null} as Message; }

/** A newsletter whose images are hidden with no way to reveal them reads as
 *  a page of blank boxes. Stream used to pass `showImagesBar={false}`. */
test("stream offers 显示图片 for a newsletter with remote images", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10000 });
  await page.evaluate(async () => { await window.__sendpalmE2E?.resetData(); });
  await page.addInitScript((s: string) => sessionStorage.setItem("__sendpalm_e2e_seed", s),
    JSON.stringify({ accounts:[a()], contacts:[c()], messages:[m()] }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10000 });
  await page.locator('#sidebar [data-nav-view="feed"]').click();
  await page.locator('[data-stream-card]').first().click();
  await expect(page.locator("[data-show-images-bar]")).toBeVisible({ timeout: 5000 });
});
