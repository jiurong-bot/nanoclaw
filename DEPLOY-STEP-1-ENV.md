# NanoClaw 部署 Step 1：环境准备
## 「从零构建运行环境」- 30 分钟完成

---

## 🎯 **Step 1 目标**

在你的 Android 手机上建立一个完整的开发环境，包括：

```
✅ Termux（终端模拟器）
✅ Ubuntu 系统（通过 proot-distro）
✅ Node.js v24（JavaScript 运行时）
✅ npm 10.x（包管理器）
✅ NanoClaw 项目目录结构
```

完成后，你将拥有一个可以运行 NanoClaw 的完整环境。

---

## 📋 **前置条件**

开始前请确保：

```
✅ Android 手机 8.0 及以上
✅ WiFi 网络连接（稳定最好）
✅ 至少 2GB 可用存储空间
✅ 手机电量 >50%
✅ 可以安装应用程序
```

---

## ⚙️ **Sub-Step 1.1：安装 Termux**

Termux 是一个 Android 终端模拟器，让你可以在手机上运行 Linux 命令。

### 安装方法 A：F-Droid（推荐）

```
1️⃣ 在手机浏览器打开：https://f-droid.org/packages/com.termux/
2️⃣ 点击"安装"按钮
3️⃣ 安装完成后打开应用
4️⃣ 等待初始化（第一次打开会下载文件，2-3 分钟）

✅ 验证：看到竖线光标或 $ 提示符，表示成功
```

### 安装方法 B：Google Play（备选）

```
1️⃣ 打开 Google Play 商店
2️⃣ 搜索"Termux"（开发者：Fredrik Fornwall）
3️⃣ 点击安装
4️⃣ 打开应用
```

---

## ⚙️ **Sub-Step 1.2：在 Termux 中更新包**

打开 Termux 后，你会看到：

```
$ 
```

这就是 Termux 的命令行提示符。现在输入以下命令（逐个执行）：

### 命令 1：更新包列表

```bash
$ apt update
```

**说明：** 这会更新 Termux 的软件源列表，需要网络连接。
**预期结果：** 会显示很多下载信息，最后显示"done"或类似的完成提示
**耗时：** 2-3 分钟

### 命令 2：升级已安装的包

```bash
$ apt upgrade -y
```

**说明：** 升级 Termux 内已安装的软件包
**预期结果：** 会列出要升级的包，然后开始安装
**耗时：** 5-10 分钟（取决于网速）

---

## ⚙️ **Sub-Step 1.3：安装 proot-distro**

proot-distro 是一个工具，让我们可以在 Termux 中运行完整的 Linux 发行版（如 Ubuntu）。

```bash
$ apt install proot-distro -y
```

**说明：** 安装 proot-distro 工具本身
**预期结果：** 看到"done"或安装完成提示
**耗时：** 1-2 分钟

### 验证安装

```bash
$ proot-distro
```

**预期结果：** 显示 proot-distro 的用法帮助信息（很多行）
**表示：** 安装成功！

---

## ⚙️ **Sub-Step 1.4：安装 Ubuntu 系统**

现在我们要在 Termux 中安装一个完整的 Ubuntu Linux 系统。这一步会下载约 500-800MB 的文件。

```bash
$ proot-distro install ubuntu
```

**说明：** 下载并安装 Ubuntu 22.04 LTS
**预期结果：** 
- 首先会显示下载进度
- 可能会问"Do you want to continue?"，输入 `y` 并按 Enter
- 最后会说"Installation finished"
**耗时：** 5-15 分钟（取决于网速）
**注意：** 不要中断这个过程！

### 验证 Ubuntu 安装

```bash
$ proot-distro login ubuntu
```

**预期结果：** 提示符从 `$` 变成 `root@localhost:~#`，表示已进入 Ubuntu 环境

**退出 Ubuntu 回到 Termux：**

```bash
root@localhost:~# exit
```

**预期结果：** 回到 `$` 提示符

---

## ⚙️ **Sub-Step 1.5：在 Ubuntu 中安装 Node.js v24**

现在我们需要进入 Ubuntu 环境，安装 Node.js 和 npm。

### 进入 Ubuntu

```bash
$ proot-distro login ubuntu
```

现在你在 Ubuntu 环境中。提示符是 `root@localhost:~#`

### 命令序列（在 Ubuntu 中执行）

**命令 1：更新 Ubuntu 包管理器**

```bash
root@localhost:~# apt update && apt upgrade -y
```

**耗时：** 3-5 分钟

**命令 2：安装必要的工具**

```bash
root@localhost:~# apt install curl wget build-essential -y
```

**耗时：** 2-3 分钟

**命令 3：添加 Node.js 官方源**

```bash
root@localhost:~# curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
```

**说明：** 从 NodeSource 官方添加 Node.js 24.x 的软件源
**耗时：** 1-2 分钟

**命令 4：安装 Node.js v24**

```bash
root@localhost:~# apt install nodejs -y
```

**耗时：** 5-10 分钟

### 验证 Node.js 和 npm

```bash
root@localhost:~# node --version
```

**预期结果：** 显示 `v24.x.x`（如 v24.0.0）

```bash
root@localhost:~# npm --version
```

**预期结果：** 显示 `10.x.x`（如 10.7.0）

如果两个命令都显示了正确的版本号，说明 Node.js 安装成功！✅

---

## ⚙️ **Sub-Step 1.6：创建 NanoClaw 项目目录**

现在创建一个目录来存放 NanoClaw 项目。

**仍在 Ubuntu 环境中（root@localhost:~#）**

```bash
root@localhost:~# mkdir -p ~/nanoclaw
root@localhost:~# cd ~/nanoclaw
```

### 验证

```bash
root@localhost:~/nanoclaw# pwd
```

**预期结果：** 显示 `/root/nanoclaw`

```bash
root@localhost:~/nanoclaw# ls -la
```

**预期结果：** 显示目录内容（最初应该是空的）

---

## ⚙️ **Sub-Step 1.7：初始化 npm 项目**

在 nanoclaw 目录中初始化一个 npm 项目。

```bash
root@localhost:~/nanoclaw# npm init -y
```

**说明：** 使用 `-y` 参数自动接受所有默认设置
**预期结果：** 创建一个 `package.json` 文件

### 验证

```bash
root@localhost:~/nanoclaw# ls -la
```

**预期结果：** 应该看到 `package.json` 文件

```bash
root@localhost:~/nanoclaw# cat package.json
```

**预期结果：** 显示 JSON 格式的项目配置

---

## ✅ **Step 1 完成检查清单**

执行完以上所有步骤后，请逐个验证：

```
□ Termux 已安装并能打开
□ Termux 显示 $ 提示符
□ apt update 和 apt upgrade 成功
□ proot-distro 已安装
□ Ubuntu 已安装，能进入 proot-distro login ubuntu
□ 在 Ubuntu 中能执行命令
□ node --version 显示 v24.x.x
□ npm --version 显示 10.x.x
□ ~/nanoclaw 目录已创建
□ ~/nanoclaw/package.json 文件已生成

全部 ✅ = Step 1 完成！
```

---

## 🔧 **常见问题与解决**

### ❌ 问题 1：Termux 无法连接网络

**症状：** `apt update` 时显示网络错误

**解决：**
1. 检查手机 WiFi 是否连接
2. 尝试 `ping google.com` 测试网络
3. 如果无法 ping 国外网址，可能需要配置梯子或使用国内源

**国内源备选：**
```bash
# 如果 NodeSource 源太慢，可用阿里云源
curl -fsSL https://mirrors.aliyun.com/nodejs/setup_24.x | bash -
```

---

### ❌ 问题 2：apt install 非常慢

**症状：** 安装包时下载速度很慢（几 KB/s）

**解决：**
1. 这是正常现象，耐心等待
2. 网速不好的话可能需要 30-60 分钟
3. 不要中断安装过程
4. 确保 WiFi 连接稳定

**优化：** 可以尝试用更好的网络环境重新做这一步

---

### ❌ 问题 3：Node.js 安装失败

**症状：** `apt install nodejs` 显示找不到包

**解决：**
1. 确保执行了 `curl -fsSL https://deb.nodesource.com/setup_24.x | bash -`
2. 确保这条命令成功完成
3. 尝试再次运行这条命令
4. 然后再 `apt install nodejs -y`

---

### ❌ 问题 4：卡在某个步骤

**症状：** 某个命令长时间无反应

**解决：**
1. 多等几分钟（网络慢时正常）
2. 如果超过 5 分钟还无反应，按 `Ctrl+C` 中止
3. 检查网络连接
4. 重新执行该命令

---

### ❌ 问题 5：权限错误（Permission denied）

**症状：** 某个命令显示"Permission denied"

**解决：**
1. 确保你在 Ubuntu 环境中（提示符是 `root@localhost:~#`）
2. 如果不在，先 `exit` 退出再 `proot-distro login ubuntu` 重新进入
3. 确保在 /root/nanoclaw 目录中
4. 不要修改文件权限，直接重新执行命令

---

## 📊 **预期耗时统计**

```
安装 Termux：5 分钟
apt update + upgrade：10-15 分钟
proot-distro install：5 分钟
Ubuntu install：10-15 分钟
Node.js 安装：10-15 分钟
创建项目目录：1 分钟

总计：40-60 分钟

实际耗时取决于网速。慢网络可能需要 2 小时。
```

---

## 🎯 **下一步**

Step 1 完成后，告诉我：

```
「Step 1 完成」

并附上：
✅ node --version 的输出
✅ npm --version 的输出  
✅ ~/nanoclaw 目录确认存在
```

然后我们进入 **Step 2：NanoClaw 核心系统部署**

---

## 💡 **小贴士**

```
1. 如果网络太慢，可以在手机上播个音乐/视频作为背景活动
2. 不要关闭 WiFi，保持网络稳定
3. 可以长按屏幕选择文本（如果需要复制命令）
4. 如果看不清屏幕，可以用双指缩放调整文本大小
5. 每个命令执行后都会有明确的"完成"提示
```

---

**现在开始吧！祝你顺利！** 🚀

有任何问题或卡住了就告诉我！
