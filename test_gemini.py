import urllib.request
import json
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyCVbgT_oTV3tJ7kC1uoU8apkCIB4QvDSuo"
payload = {
    "contents": [
        {"parts": [{"text": "hello"}]}
    ]
}
data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as res:
        print(res.read().decode("utf-8"))
except urllib.error.URLError as e:
    print(e.read().decode("utf-8"))
