# VHS script (https://github.com/charmbracelet/vhs): records docs/demo-terminal.gif, about 15 seconds.
# Shows the "no install, no build" path: clone → see how small the app is → serve it.
# Run from an empty directory with internet access:  vhs docs/demo.tape
# For the UI demo (docs/demo.gif) use `npm run demo` instead. VHS can only record terminals.

Output docs/demo-terminal.gif

Require git
Require node

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 560
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set PlaybackSpeed 1.0

Hide
Type "cd $(mktemp -d) && clear" Enter
Show

Type "git clone -q --depth 1 https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager.git vyapareasy"
Enter
Sleep 2.5s

Type "cd vyapareasy && du -h app/index.html && ls node_modules 2>/dev/null | wc -l   # one file, zero deps"
Enter
Sleep 2s

Type "node scripts/serve.js &   # no npm install, no build step"
Enter
Sleep 1.5s

Type "curl -s localhost:8080 | grep -m1 -o '<title>.*</title>'"
Enter
Sleep 2.5s

Type "# → open http://localhost:8080 and create your first GST invoice"
Sleep 2.5s

Hide
Type "kill %1" Enter
