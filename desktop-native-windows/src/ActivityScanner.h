#pragma once
#include <string>
#include <vector>

struct DetectedActivity {
    std::string name;
    std::string exeName;
};

class ActivityScanner {
public:
    static ActivityScanner& Instance();
    std::string ScanRunningActivitiesJson();
};
