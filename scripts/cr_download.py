"""
Download CommonRoad scenario XMLs from GitLab API.
Pulls raw XML files from gitlab.lrz.de/tum-cps/commonroad-scenarios.
"""

import os
import requests
import time

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "commonroad_xml")

# GitLab project: tum-cps/commonroad-scenarios
GITLAB_HOST = "https://gitlab.lrz.de"
PROJECT_ID = "34387"  # tum-cps/commonroad-scenarios
BRANCH = "2020a_scenarios"

# Scenarios with their known paths in the repo
SCENARIOS = {
    # 2-lane urban / T-junction (in scenarios/recorded/hand-crafted/)
    "DEU_B471-1_1_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_Muc-4_1_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_Muc-4_2_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_Muc-2_1_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_Muc-2_2_T-1.xml": "scenarios/recorded/hand-crafted",
    "ZAM_Tjunction-1_42_T-1.xml": "scenarios/recorded/hand-crafted",
    "ZAM_Tjunction-1_100_T-1.xml": "scenarios/recorded/hand-crafted",
    "ZAM_Tjunction-1_150_T-1.xml": "scenarios/recorded/hand-crafted",
    "ZAM_Tjunction-1_60_T-1.xml": "scenarios/recorded/hand-crafted",
    "ZAM_Tjunction-1_80_T-1.xml": "scenarios/recorded/hand-crafted",
    # Highway (in scenarios/recorded/NGSIM/US101/)
    "USA_US101-10_3_T-1.xml": "scenarios/recorded/NGSIM/US101",
    "USA_US101-21_1_T-1.xml": "scenarios/recorded/NGSIM/US101",
    "USA_US101-25_1_T-1.xml": "scenarios/recorded/NGSIM/US101",
    "USA_US101-14_1_T-1.xml": "scenarios/recorded/NGSIM/US101",
    "USA_US101-29_2_T-1.xml": "scenarios/recorded/NGSIM/US101",
    # DEU highway/autobahn
    "DEU_A9-2_1_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_A99-1_1_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_A99-1_2_T-1.xml": "scenarios/recorded/hand-crafted",
    "DEU_Flensburg-5_1_T-1.xml": "scenarios/recorded/SUMO",
}

# Fallback directories to search
FALLBACK_DIRS = [
    "scenarios/recorded/hand-crafted",
    "scenarios/recorded/NGSIM/US101",
    "scenarios/recorded/SUMO",
    "scenarios/recorded/cooperative",
    "scenarios/interactive/hand-crafted",
    "scenarios/interactive/SUMO",
]


def get_raw_url(file_path: str) -> str:
    """Build the raw file URL for GitLab API."""
    encoded = requests.utils.quote(file_path, safe="")
    return f"{GITLAB_HOST}/api/v4/projects/{PROJECT_ID}/repository/files/{encoded}/raw?ref={BRANCH}"


def download_file(filename: str, directory: str) -> bool:
    """Download a single file from a known directory."""
    dest = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(dest):
        print(f"  [skip] {filename} already exists")
        return True

    file_path = f"{directory}/{filename}"
    url = get_raw_url(file_path)
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200 and resp.text.strip().startswith("<?xml"):
            with open(dest, "w") as f:
                f.write(resp.text)
            print(f"  [ok]   {filename} <- {directory}/")
            return True
    except Exception as e:
        print(f"  [err]  {filename}: {e}")

    # Try fallback directories
    for fb_dir in FALLBACK_DIRS:
        if fb_dir == directory:
            continue
        file_path = f"{fb_dir}/{filename}"
        url = get_raw_url(file_path)
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200 and resp.text.strip().startswith("<?xml"):
                with open(dest, "w") as f:
                    f.write(resp.text)
                print(f"  [ok]   {filename} <- {fb_dir}/ (fallback)")
                return True
        except Exception:
            continue

    print(f"  [FAIL] {filename} not found in any directory")
    return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Downloading {len(SCENARIOS)} CommonRoad scenarios to {OUTPUT_DIR}/\n")

    success = 0
    failed = []
    for filename, directory in SCENARIOS.items():
        ok = download_file(filename, directory)
        if ok:
            success += 1
        else:
            failed.append(filename)
        time.sleep(0.3)  # Be polite to the API

    print(f"\nDone: {success}/{len(SCENARIOS)} downloaded")
    if failed:
        print(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
