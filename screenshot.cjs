const { execSync } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
// 配置项（可根据需要修改）
const config = {
  url: 'http://localhost:50591',        // 要访问的网址（由 Python 脚本注入）
  screenshotPath: path.join(__dirname, 'screenshot.png'), // 截图保存路径
  urlreportPath: path.join(__dirname, 'url_check_report.json'), // URL 检查报告保存路径
  viewport: { width: 1440, height: 1080 }, // 浏览器视口大小
  fullPage: true, // 开启整页截图（关键）
  headless: true  // 是否无头模式（false会显示浏览器窗口）
};
/**
 * 增强版网页截图函数（包含懒加载处理）
 */
async function enhancedScreenshot() {
  let browser;
  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: config.headless,
      timeout: 60000
    });
    // 创建新页面并设置视口
    const page = await browser.newPage();
    await page.setViewportSize(config.viewport);
    // 访问目标网址
    console.log(`正在访问: ${config.url}`);
    await page.goto(config.url, {
      timeout: 60000,
      waitUntil: 'networkidle' // 等待网络空闲（比domcontentloaded更彻底）
    });
    // 初始等待，确保页面基础内容渲染完成
    console.log('等待页面初始渲染...');
    await page.waitForTimeout(3000);

    const clickResult = await page.evaluate(() => {
      if (window.__swalmStartButtonClicked) return { clicked: false, already: true };
      const patterns = [
        /start game/i,
        /begin game/i,
        /开始游戏/i,
        /begin/i,
        /start/i,
        /开始/i,
      ];
      const selectors = [
        'button',
        '[role="button"]',
        'a',
        'input[type="button"]',
        'input[type="submit"]',
      ];
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return !!style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const getText = (el) => {
        const aria = el.getAttribute('aria-label') || '';
        if (el.tagName === 'INPUT') {
          return ((el.getAttribute('value') || aria)).trim();
        }
        return ((el.innerText || el.textContent || aria)).trim();
      };
      const elements = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
      for (const re of patterns) {
        for (const el of elements) {
          if (!isVisible(el)) continue;
          const text = getText(el);
          if (!text) continue;
          if (re.test(text)) {
            window.__swalmStartButtonClicked = true;
            try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
            try { el.click(); } catch (e) {}
            return { clicked: true, text };
          }
        }
      }
      return { clicked: false };
    });

    if (clickResult && clickResult.clicked) {
      console.log(`检测到开始按钮并已点击: ${clickResult.text}`);
      await page.waitForTimeout(1500);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const level1Result = await page.evaluate(() => {
      if (window.__swalmLevel1Clicked) return { clicked: false, already: true };
      const patterns = [
        /第一关/i,
        /第\s*1\s*关/i,
        /第\s*一\s*关/i,
        /关卡\s*1(?!\d)/i,
        /关卡\s*一/i,
        /level\s*1/i,
      ];
      const selectors = [
        'button',
        '[role="button"]',
        'a',
        '[onclick]',
        'input[type="button"]',
        'input[type="submit"]',
      ];
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return !!style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const getText = (el) => {
        const aria = el.getAttribute('aria-label') || '';
        if (el.tagName === 'INPUT') {
          return ((el.getAttribute('value') || aria)).trim();
        }
        return ((el.innerText || el.textContent || aria)).trim();
      };
      const elements = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
      for (const re of patterns) {
        for (const el of elements) {
          if (!isVisible(el)) continue;
          const text = getText(el);
          if (!text) continue;
          if (re.test(text)) {
            window.__swalmLevel1Clicked = true;
            try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
            try { el.click(); } catch (e) {}
            return { clicked: true, text };
          }
        }
      }
      return { clicked: false };
    });

    if (level1Result && level1Result.clicked) {
      console.log(`检测到关卡入口并已点击: ${level1Result.text}`);
      await page.waitForTimeout(1500);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 滚动到底部触发懒加载
    console.log('滚动页面触发懒加载...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 1000; // 每次滚动距离
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          console.log(`当前页面总高度: ${scrollHeight}, 已滚动: ${totalHeight}`);
          window.scrollBy(0, distance);
          totalHeight += distance;
          // 滚动到底部时停止
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 500); // 每500ms滚动一次
      });
    });
    // 回到页面顶部，避免fixed元素位置异常
    console.log('返回页面顶部...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        window.scrollTo(0, 0);
        resolve();
      });
    });
    // 最终等待，确保所有内容稳定渲染
    console.log('等待页面内容稳定...');
    await page.waitForTimeout(5000);
    // 截取全页截图
    console.log(`正在截取整页截图，保存至: ${config.screenshotPath}`);
    await page.screenshot({
      path: config.screenshotPath,
      fullPage: config.fullPage,
      animations: 'disabled', // 禁用动画确保截图稳定
      timeout: 60000
    });
    console.log('截图完成！');
    
    // 记录控制台是否报错

    try {
      console.log("正在检测控制台是否报错...");
      // 这行会阻塞，直到命令执行完毕
      execSync(`aidp_url_check ${config.url} -o ${config.urlreportPath}`); 
      console.log(`检测完成，报告已生成：${config.urlreportPath}`);
    } catch (error) {
      console.error("控制台输出执行出错了：", error.message);
    }
    
  } catch (error) {
    console.error('截图过程出错:', error);
  } finally {
    // 确保浏览器关闭
    if (browser) {
      await browser.close();
    }
  }
}
enhancedScreenshot();