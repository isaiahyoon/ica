on run
	try
		set photos to choose file with prompt "Choose HEIC or HEIF photos to convert:" with multiple selections allowed
		convertPhotos(photos)
	on error errorMessage number errorNumber
		if errorNumber is not -128 then display dialog errorMessage with title "Gallery Photo Converter" buttons {"OK"} with icon caution
	end try
end run

on open photos
	convertPhotos(photos)
end open

on convertPhotos(photos)
	try
		set converter to POSIX path of (path to resource "prepare-gallery-photos.mjs")
		set commandText to "/usr/bin/env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node " & quoted form of converter
		repeat with photo in photos
			set commandText to commandText & " " & quoted form of POSIX path of photo
		end repeat
		set commandText to commandText & " 2>&1"
		display notification "Converting photos. A message will appear when finished." with title "Gallery Photo Converter"
		set resultText to do shell script commandText
		display dialog resultText with title "Gallery Photo Converter" buttons {"OK"} default button "OK"
	on error errorMessage
		display dialog errorMessage with title "Gallery Photo Converter" buttons {"OK"} default button "OK" with icon caution
	end try
end convertPhotos
