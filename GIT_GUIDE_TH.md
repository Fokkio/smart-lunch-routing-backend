# คู่มือ Git และ GitHub สำหรับทีม

คู่มือนี้ใช้กับสอง repository:

- Frontend: [Fokkio/smart-lunch-routing](https://github.com/Fokkio/smart-lunch-routing)
- Backend: [Fokkio/smart-lunch-routing-backend](https://github.com/Fokkio/smart-lunch-routing-backend)
- Project: [Smart Lunch Routing - Full Stack Team](https://github.com/users/Fokkio/projects/2)

สมาชิกแต่ละคนทำทั้ง frontend และ backend ของฟีเจอร์เดียวกัน ให้เปิด branch และ Pull Request แยกในแต่ละ repository

## 1. เตรียมเครื่องครั้งแรก

ติดตั้ง Git และ GitHub CLI บน Windows:

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```

ปิดแล้วเปิด PowerShell ใหม่ จากนั้นตรวจสอบ:

```powershell
git --version
gh --version
```

ตั้งชื่อและอีเมลสำหรับ commit:

```powershell
git config --global user.name "ชื่อที่ต้องการแสดง"
git config --global user.email "อีเมลที่ใช้กับ GitHub"
```

เข้าสู่ระบบผ่านเบราว์เซอร์:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

ห้ามส่ง password หรือ token ให้สมาชิกคนอื่น และห้ามใส่ secret หรือไฟล์ `.env` จริงใน commit

## 2. รับคำเชิญ

เปิด GitHub Notifications หรืออีเมลและตอบรับคำเชิญของ frontend repo, backend repo และ GitHub Project ก่อนเริ่มงาน Frontend เป็น private จึง clone ไม่ได้จนกว่าจะตอบรับคำเชิญ

## 3. Clone สอง repository

```powershell
New-Item -ItemType Directory -Path D:\SmartLunchTeam
Set-Location D:\SmartLunchTeam
git clone https://github.com/Fokkio/smart-lunch-routing.git
git clone https://github.com/Fokkio/smart-lunch-routing-backend.git
```

ติดตั้ง dependencies:

```powershell
cd D:\SmartLunchTeam\smart-lunch-routing
npm.cmd install

cd D:\SmartLunchTeam\smart-lunch-routing-backend
npm.cmd install
```

## 4. รับงานจาก Issues และ Project

แต่ละคนจะมีหนึ่ง Issue ใน frontend และอีกหนึ่ง Issue ใน backend เมื่อเริ่มทำให้เปลี่ยนสถานะ Issue เป็น `In Progress`

| คน | Branch ที่ใช้ในทั้งสอง repo |
|---|---|
| คนที่ 1 — Customer | `feat/customer-management` |
| คนที่ 2 — Order | `feat/order-management` |
| คนที่ 3 — Routing | `feat/route-planning` |
| คนที่ 4 — Rider | `feat/rider-workflow` |

## 5. สร้าง branch ก่อนแก้โค้ด

ตัวอย่างงาน Customer ใน frontend:

```powershell
cd D:\SmartLunchTeam\smart-lunch-routing
git switch main
git pull --ff-only origin main
git switch -c feat/customer-management
```

ทำแบบเดียวกันใน backend:

```powershell
cd D:\SmartLunchTeam\smart-lunch-routing-backend
git switch main
git pull --ff-only origin main
git switch -c feat/customer-management
```

ห้ามทำงานบน `main` โดยตรง

## 6. ตรวจและ commit งาน

```powershell
git status
git diff
git add path\to\file
git status
git commit -m "Connect customer page to backend API"
git push -u origin feat/customer-management
```

ครั้งต่อไปบน branch เดิมใช้ `git push`

## 7. ดึง main ล่าสุดระหว่างทำงาน

```powershell
git fetch origin
git merge origin/main
```

ถ้ามี conflict ให้รัน `git status` แล้วเปิดไฟล์ที่มีเครื่องหมายต่อไปนี้:

```text
เครื่องหมายเปิด: <<<<<<< HEAD
โค้ดของเรา
เครื่องหมายแบ่ง: =======
โค้ดจาก main
เครื่องหมายปิด: >>>>>>> origin/main
```

เลือกโค้ดที่ถูกต้อง ลบเครื่องหมาย แล้วรัน:

```powershell
git add path\to\conflicted-file
git commit
git push
```

ถ้ายังไม่แน่ใจ ให้ยกเลิก merge แล้วขอให้ทีมช่วย:

```powershell
git merge --abort
```

## 8. ทดสอบก่อนเปิด Pull Request

Frontend:

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

Backend:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 9. เปิด Pull Request

```powershell
gh pr create --base main --fill
```

ในคำอธิบาย PR ให้ระบุสิ่งที่เปลี่ยน วิธีทดสอบ Issue ที่เกี่ยวข้อง และผลกระทบต่อ API หรือฐานข้อมูล ถ้า Issue อยู่ใน repository เดียวกัน ใช้ `Closes #หมายเลข` ถ้าอยู่คนละ repository ให้ใส่ URL เต็ม

ให้สมาชิกอีกคน review ก่อน merge และเปลี่ยนสถานะ Project เป็น `Review`

## 10. หลัง PR ถูก merge

```powershell
git switch main
git pull --ff-only origin main
git branch -d feat/customer-management
```

จากนั้นเปลี่ยนสถานะ Issue เป็น `Done`

## คำสั่งที่ควรรู้

| คำสั่ง | ความหมาย |
|---|---|
| `git status` | ดู branch และไฟล์ที่เปลี่ยน |
| `git diff` | ดูรายละเอียดโค้ดที่แก้ |
| `git switch <branch>` | เปลี่ยน branch |
| `git switch -c <branch>` | สร้าง branch ใหม่ |
| `git pull --ff-only origin main` | ดึง main ล่าสุด |
| `git add <file>` | เลือกไฟล์เข้า commit |
| `git commit -m "ข้อความ"` | บันทึกการเปลี่ยนแปลง |
| `git push` | ส่ง branch ขึ้น GitHub |
| `git fetch origin` | โหลดข้อมูลล่าสุดโดยยังไม่รวมโค้ด |
| `git merge origin/main` | รวม main ล่าสุดเข้า branch |
| `git log --oneline -10` | ดู 10 commits ล่าสุด |

## คำสั่งที่ห้ามใช้โดยไม่ถามทีม

```powershell
git push --force
git reset --hard
git clean -fd
git branch -D
```

อย่าใช้ `git add .` หรือ `git add -A` โดยไม่ตรวจ `git status` ก่อน เพราะอาจเพิ่มไฟล์ของคนอื่น ไฟล์ generated หรือไฟล์ลับเข้า commit
