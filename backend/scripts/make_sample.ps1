# Generates a sample talking video used to exercise the Fastclip pipeline
# locally. Uses the Windows speech synthesiser (no network, no extra deps).
param(
    [string]$OutDir = "$PSScriptRoot\..\..\samples"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$wav = Join-Path $OutDir "speech.wav"
$mp4 = Join-Path $OutDir "sample-talk.mp4"

$script = @'
Welcome back to the channel. Today I want to talk about the single biggest mistake that new creators make, and how you can avoid it starting today.
Here is the mistake. Most people spend ninety percent of their time recording, and only ten percent of their time thinking about the first three seconds of the video.
That is backwards. The first three seconds decide whether anyone watches the rest at all. If you lose someone there, nothing else you did matters.
So here is a concrete fix that takes about five minutes. Before you record anything, write down three different opening lines. Just three. Read them out loud.
Pick the one that makes you slightly uncomfortable, because that is usually the one that is specific enough to be interesting. Vague openings feel safe and they perform terribly.
Now let me give you a second tip, and this one saved me hours every single week. Stop editing while you record. Record the full take, then edit once.
When you stop and restart every ten seconds, you break your own rhythm, and the energy in your voice drops. Viewers feel that even if they cannot explain why.
Record for three minutes straight, even if you stumble. You can cut the stumbles later. What you cannot fix later is flat energy.
Here is the third thing, and honestly this is the one people argue with me about the most. You do not need better gear. You need better structure.
A clear idea, recorded on a phone, in a quiet room, will beat a confused idea recorded on a cinema camera every single time. Structure is the multiplier. Gear is not.
So let me wrap this up with the one sentence I want you to remember. Hook first, energy second, gear last. If you get those three in the right order, everything else becomes easier.
Try it on your next video and tell me how it goes. I read every comment, and I would genuinely love to know which of these three actually moved the needle for you.
'@

Write-Host "Synthesising speech..."
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.SetOutputToWaveFile($wav)
$synth.Speak($script)
$synth.Dispose()

$ffmpeg = & "$PSScriptRoot\..\.venv\Scripts\python.exe" -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"
Write-Host "Muxing video with $ffmpeg"

& $ffmpeg -y -hide_banner -loglevel error `
    -f lavfi -i "color=c=0x141C30:s=1280x720:r=25" `
    -i $wav `
    -vf "drawtext=text='Fastclip sample':fontcolor=0xF4F7FB:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='%{pts\:hms}':fontcolor=0x69A7FF:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2+50" `
    -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p `
    -c:a aac -b:a 128k -ac 1 -ar 44100 `
    -shortest $mp4

Write-Host "Done: $mp4"
