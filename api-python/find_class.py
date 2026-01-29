import jpype
import mpxj
import os

if not jpype.isJVMStarted():
    jpype.startJVM(convertStrings=True)

def find_cpm_class():
    prefixes = ['org.mpxj.common', 'org.mpxj.cpm', 'org.mpxj.scheduling', 'org.mpxj']
    for p in prefixes:
        name = f"{p}.CriticalPathMethodAnalyzer"
        try:
            c = jpype.JClass(name)
            print(f"FOUND: {name}")
            return c
        except:
            print(f"Not found: {name}")
    
    # Try searching for anything related to CPM
    print("Searching for Scheduler classes...")
    schedulers = ['org.mpxj.cpm.Scheduler', 'org.mpxj.common.Scheduler']
    for s in schedulers:
        try:
            c = jpype.JClass(s)
            print(f"FOUND Scheduler: {s}")
        except:
            print(f"Not found Scheduler: {s}")

find_cpm_class()
