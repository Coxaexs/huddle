#pragma once

#include <string>

class ActivityScanner {
public:
    static ActivityScanner& Instance();
    std::string ScanRunningActivitiesJson();

private:
    ActivityScanner() = default;
};
