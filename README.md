> Action is the foundational key to all success.
> — Pablo Picasso
# LabelingSystem
This is my personal and very beginner takes on Labeling System. This web app will allow user to edit and rank 5 random voices from [[mozilla-foundation/common_voice_17_0]] Dataset, specifically Th/Test data.
*Built with Node.js and Vanilla HTML/CSS*

## Features
- Rate the voices on their pronunciation, naturalness, and noise level.
- Edit the transcription if you think they don't match.
- Download the database db on the site with password protection.
- Require user to have an account before ranking.
### Incoming
- [ ] Add flags or comment system.
- [ ] Full on rework on UX/UI.
- [ ] Sentence Sense checker.
- [ ] Homophones suggestion.

## Installation
```
git clone https://github.com/ItsRatcha/labelingsystem.git
npm install
node extract_audio.js
```

## Usage
First, add your Huggingface API to the terminal
cmd:
```
set HF_TOKEN=MYTOKEN
```
PowerShell:
```
$env:HF_TOKEN="MYTOKEN"
```
Then run server with:
```
node server.js
```
The default port for this is [3000](http://localhost:3000)

## Database
The output is in a db file called database.db which will automatically be generated if there are none in the directory.
### Data type
Structured
### Data Fields
- `id`: PK of the database
- `voice_id`: Name of the voice file
- `original_transcription`: original transcription
- `edited_transcription`: edited transcription
- `transcription_changed`: boolean for ease to see if the original transcription is edited (True if edited)
- `noise_rating`: integer from 1-5
- `naturalness_rating`: integer from 1-5
- `pronunciation_rating`: integer from 1-5
- `username`: the user who gave the rating
- `timestamp`: datetime of when the rating took place
### Example data
```
{
  'id': 6,
  'voice_id': 'common_voice_th_25703127.mp3',
  'original_transcription': 'เด็กกำลังไม่สบาย',
  'edited_transcription': 'เด็กกำลังไม่สบายนะ',
  'transcription_changed': True,
  'noise_rating': 4,
  'naturalness_rating': 4,
  'pronunciation_rating' 4,
  'username': 'admin',
  'timestamp': '2025-04-03 05:46:34'
}
```

## Dataset
The current build uses data from [mozilla-foundation/common_voice_17_0](https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0)
 Dataset, specifically Th/Test data. You can change the dataset by changing the `const DATASET_TSV_URL` in *server.js* and `const TAR_FILE_URL` in extract_audio.js

# Author
---
Made by Ratchanon Moungwichean
Bachelor Student in Computer Engineer at Thammasat University
Email: RatchaM.work@gmail.com

## License
This project is licensed under the [MIT License](LICENSE).
