# 合成大派蒙 · 面向对象分析与设计课程项目最终版

本仓库交付通过自然语言与 Coding Agent 逐轮开发的单人网页游戏最终版。电脑横版页面左侧为棋盘，右侧为分数、下一角色、预备位、轻推和八级图鉴；全程可用鼠标操作。玩家投放 1～3 级角色，同级碰撞后合成升级并计分；角色持续越过警戒线会结束本局。项目使用 TypeScript、Phaser 和 Phaser 内置 Matter 物理，提供八级透明角色图与逐级复合碰撞体。

## 运行

进入 `game/`，执行：

```powershell
npm install
npm run dev
```

终端会显示本地访问地址。也可先执行 `npm run build`，再直接打开 `game/index.html`；仓库已包含离线脚本。线上演示：[merge-paimon.onrender.com](https://merge-paimon.onrender.com/)。完整操作、测试和 Render 静态站点配置见 [游戏 README](game/README.md)。

## 课程材料

- [项目报告](docs/项目报告.md)：最终版范围、需求与设计、逐轮交互和实际测试证据。
- [开发过程记录](docs/开发过程记录.md)：真实提示词、每轮实际产出及用户反馈。
- [端到端验收表](docs/第12轮_端到端人工验收表.md)：课程阶段记录和最终版补充验收项。
- [需求分析](docs/需求分析.md)、[系统分析](docs/系统分析.md)、[系统设计](docs/系统设计.md)、[开发计划](docs/开发计划.md)。
- [角色素材清单](docs/素材清单.md)与[音乐素材清单](docs/音乐素材清单.md)。

报告 Markdown 是可编辑源文件，PDF 位于 `output/pdf/`。需要重新导出时，在 Windows 上安装 Python、ReportLab 和 Pillow，然后从仓库根目录执行 `python tools/build_report.py`；脚本使用系统的 Deng 字体并将报告中的截图一并嵌入 PDF。

仓库包含原创角色 PNG、游戏代码、短音效生成逻辑和背景音乐文件 `game/assets/audio/a-day-in-mondstadt.mp3`，供项目负责人的个人、非商业课程演示使用。该曲目属于《原神》相关权利人，非本项目原创；文件来源和校验值见[音乐素材清单](docs/音乐素材清单.md)。本仓库不对第三方曲目作再授权。

用户已确认课程阶段的核心玩法和多轮界面修改；最终版的新增功能与布局以本次文档、现行代码及实测命令为准。未收到逐项测试设备、音效听感或帧率数值时，文档不补造这些数据。
