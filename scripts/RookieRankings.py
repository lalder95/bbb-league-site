import chromedriver_autoinstaller
from selenium import webdriver
import re
import json

# Automatically download and install ChromeDriver
chromedriver_autoinstaller.install()

# Set up Chrome options
chrome_options = webdriver.ChromeOptions()
chrome_options.add_argument("--headless")  # Run Chrome in headless mode (no GUI)

# Create a Chrome WebDriver instance
driver = webdriver.Chrome(options=chrome_options)

# Navigate to the URL
url = "https://keeptradecut.com/dynasty-rankings/rookie-rankings"
driver.get(url)

# Extract page source
page_source = driver.page_source

# Use regex to extract the playersArray JSON
match = re.search(r'var playersArray = (\[.*?\]);', page_source, re.DOTALL)
if match:
    players_json = match.group(1)

    # Save only the JSON array to a file
    with open(r"G:\My Drive\AGS Football\KTCData\rookie.json", "w", encoding="utf-8") as file:
        json.dump(json.loads(players_json), file, indent=2)
else:
    print("playersArray not found in page source.")

# Close the WebDriver
driver.quit()
