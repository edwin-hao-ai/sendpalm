import XCTest

/// End-to-end tests for the iOS build, driven through the real UI (XCUITest).
///
/// The whole app is one WKWebView, so WebKit exposes the DOM to the
/// accessibility tree and XCUITest can drive it like a native app — the iOS
/// twin of the Playwright suite on desktop. Run with:
///
///     app/scripts/verify-ios-e2e.sh            # connected iPhone/iPad
///
/// `testDumpAccessibilityTree` is kept on purpose: when the UI changes, its
/// output is the fastest way to see what the test could be asserting on.
final class SendPalmUITests: XCTestCase {
  var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchEnvironment["SENDPALM_E2E"] = "1"
    app.launch()
  }

  // MARK: - helpers

  /// Attach the current screen to the test result. `keepAlways` is what makes
  /// it land in the .xcresult even when the test passes — that bundle is the
  /// evidence a device run actually happened (and what a failing run shows).
  private func shoot(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// The app is a webview; everything lives under it.
  private func webView(timeout: TimeInterval = 30) -> XCUIElement {
    let web = app.webViews.firstMatch
    XCTAssertTrue(
      web.waitForExistence(timeout: timeout),
      "the webview never appeared — the iOS build did not render"
    )
    return web
  }

  /// Text can surface as staticText, button or link depending on the node it
  /// came from, so search all three before failing.
  @discardableResult
  private func waitForAnyText(_ labels: [String], timeout: TimeInterval = 20) -> XCUIElement? {
    let web = webView()
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      for label in labels {
        let st = web.staticTexts[label]
        if st.exists { return st }
        let btn = web.buttons[label]
        if btn.exists { return btn }
        let link = web.links[label]
        if link.exists { return link }
      }
      usleep(300_000)
    } while Date() < deadline
    return nil
  }

  private func tapText(_ labels: [String], file: StaticString = #filePath, line: UInt = #line) {
    guard let el = waitForAnyText(labels, timeout: 15) ?? nil else {
      XCTFail("none of \(labels) appeared", file: file, line: line)
      return
    }
    XCTAssertTrue(el.isHittable, "\(labels) exists but is not tappable", file: file, line: line)
    el.tap()
  }

  // MARK: - the actual suite

  /// The app must boot into the Imbox with mail in it. This is the check that
  /// the 2026-11-09/11-13 "black first frame" regressions would have failed:
  /// the process launches, then `main` returns a few seconds later.
  func test01_BootsIntoImboxWithMail() {
    let imbox = waitForAnyText(["收件箱"], timeout: 40)
    XCTAssertNotNil(imbox, "the Imbox never rendered")
    // Bottom tab bar is the mobile shell; its labels are the fastest proof that
    // the layout (not just the webview) came up.
    XCTAssertNotNil(waitForAnyText(["邮件"]), "bottom tab bar missing 邮件")
    XCTAssertNotNil(waitForAnyText(["日历"]), "bottom tab bar missing 日历")
    XCTAssertEqual(app.state, .runningForeground)
    shoot("01-imbox")
  }

  /// Navigation across the four main tabs, each of which mounts a different
  /// Solid view. A blank screen after a tap is a failed render, and the value
  /// of this on a device is that WKWebView's memory + scroll behaviour differ
  /// from the simulator.
  func test02_TabsRenderTheirViews() {
    XCTAssertNotNil(waitForAnyText(["收件箱"], timeout: 40))

    tapText(["日历"])
    XCTAssertNotNil(
      waitForAnyText(["日历", "今天", "本周"], timeout: 20),
      "calendar view did not render"
    )
    XCTAssertEqual(app.state, .runningForeground)
    shoot("02-calendar")

    tapText(["联系人"])
    XCTAssertNotNil(
      waitForAnyText(["联系人", "没有", "搜索"], timeout: 20),
      "contacts view did not render"
    )
    shoot("03-contacts")

    tapText(["任务"])
    XCTAssertNotNil(waitForAnyText(["任务", "没有", "新建"], timeout: 20), "tasks view did not render")

    tapText(["邮件", "收件箱"])
    XCTAssertNotNil(waitForAnyText(["收件箱"], timeout: 20), "did not come back to the Imbox")
    XCTAssertEqual(app.state, .runningForeground)
    shoot("04-back-to-imbox")
  }

  /// Opening a mail must show its body — the panel path that the tray/notification
  /// reveal work in this session depends on.
  func test03_OpeningAMailShowsItsBody() {
    _ = webView()
    // The first row of the list is an article with the subject inside; tapping
    // the row's first static text is enough to open it.
    let candidates = app.webViews.firstMatch.staticTexts
    guard candidates.count > 0 else {
      XCTFail("the Imbox rendered no rows at all")
      return
    }
    // Skip the chrome (title / counts) and tap the first realistically long
    // label — a subject or a sender name.
    var tapped = false
    for index in 0..<min(candidates.count, 40) {
      let el = candidates.element(boundBy: index)
      let label = (el.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if label.count > 6, el.isHittable {
        el.tap()
        tapped = true
        break
      }
    }
    XCTAssertTrue(tapped, "could not find a mail row to tap")
    // The detail panel always has these three affordances on mobile.
    XCTAssertNotNil(
      waitForAnyText(["回复", "稍后", "更多"], timeout: 20),
      "the message panel did not open"
    )
    XCTAssertEqual(app.state, .runningForeground)
    shoot("05-message-panel")
  }

  /// Pull-to-refresh / sync affordance exists on the Imbox header. Not a
  /// network test — it proves the header controls are reachable and do not
  /// crash the webview.
  func test04_ImboxHeaderControlsAreReachable() {
    XCTAssertNotNil(waitForAnyText(["收件箱"], timeout: 40))
    XCTAssertNotNil(
      waitForAnyText(["同步", "一起读"], timeout: 20),
      "the Imbox header controls are missing"
    )
    tapText(["同步"])
    XCTAssertEqual(app.state, .runningForeground)
  }

  /// Diagnostic: prints the accessibility tree. Run this alone when the labels
  /// in the tests above stop matching.
  func test99_DumpAccessibilityTree() {
    _ = webView()
    print("=== SENDPALM A11Y TREE START ===")
    print(app.debugDescription)
    print("=== SENDPALM A11Y TREE END ===")
  }
}
