import { test, expect } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";
const now = new Date().toISOString();
function a(): Account { return { id:"acct-a",type:"email",provider:"custom",email:"work@example.com",label:"work",displayName:"w",status:"connected",synced:0,total:0,privacy:"unified",color:"#0a8f63",avatar:"",lastSync:now,settings:{aliases:[],signature:"",replyTo:"",defaultFrom:"work@example.com",syncFolders:[],syncFrequency:"manual",autoBcc:false,autoBccAddress:"",vacationResponder:{enabled:false,subject:"",body:""}}} as Account; }
function c(): Contact { return { id:"c1",firstName:"Hilton",lastName:"Honors",nickname:"",name:"Hilton Honors",company:"",title:"",emails:[{value:"h@x.com",label:"work"}],phones:[],stage:"active",labels:[],topics:[],notes:"",avatar:"",photo:"",health:70,sc:0,scC:"",scL:"",lc:"",grp:"",trd:"stable",pattern:"",accounts:[],stageHistory:[],firstContact:now,milestones:[],merged:false,blocked:false,notify:false,firstSeen:false,screened:true,defaultBucket:"feed",autoLabel:[],recycling:false,ch:[]} as Contact; }
function m(): Message { return { id:"f1",pid:"c1",subj:"Newsletter",prev:"hi",body:"hi",bodyHtml:"<div><img src=\"https://example.com/hero.png\" alt=\"hero\"><p>hello newsletter</p></div>",tm:"10:00",st:now,ac:"acct-a",bucket:"feed",direction:"in",unread:false,labels:[],attachments:[],trackers:[],replyLater:false,setAside:false,bubbleUpAt:null,remindAt:null,deletedAt:null,to:"me@x.com",cc:[],bcc:[],threadId:undefined,calendarInvite:null} as Message; }

/** A newsletter renders with its images, without making the reader ask.
 *
 *  This used to assert the 「显示图片」 *bar*, because images were blocked for
 *  everyone. Default is now to load them (a wall of blank boxes is not privacy,
 *  it is broken-looking), so the card must paint the real <img> — and the bar
 *  only appears for a sender the user explicitly blocked. */
test("a stream newsletter loads its images", async ({ page }) => {
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

  // The real image is in the frame and the "reveal" bar is not.
  const frame = page.frameLocator("[data-stream-card] iframe");
  await expect(frame.locator("img")).toHaveAttribute(
    "src",
    /example\.com\/hero\.png/,
    { timeout: 5_000 },
  );
  await expect(page.locator("[data-show-images-bar]")).toHaveCount(0);
});

test("a blocked sender's newsletter keeps its images behind the bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10000 });
  await page.evaluate(async () => { await window.__sendpalmE2E?.resetData(); });
  await page.addInitScript(
    (s: string) => sessionStorage.setItem("__sendpalm_e2e_seed", s),
    JSON.stringify({
      accounts: [a()],
      contacts: [{ ...c(), blocked: true }],
      messages: [m()],
    }),
  );
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10000 });
  await page.locator('#sidebar [data-nav-view="feed"]').click();
  await page.locator('[data-stream-card]').first().click();
  await expect(page.locator("[data-show-images-bar]")).toBeVisible({ timeout: 5_000 });
});
