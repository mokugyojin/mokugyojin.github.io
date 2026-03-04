const key = "AIzaSyCnC4j670-2XHqMhU2wkuN5wdgayrm-i9c";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

const payload = {
    "contents": [
        {
            "parts": [
                {
                    "text": "hello"
                }
            ]
        }
    ],
    "generationConfig": {
        "temperature": 1.2
    }
};

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
    .then(res => res.text())
    .then(text => console.log(text))
    .catch(err => console.error("ERR:", err));
