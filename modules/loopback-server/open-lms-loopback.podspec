require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "open-lms-loopback"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/euron-sde-team/euron-open-lms-mobile-application"
  s.license      = package["license"]
  s.authors      = "Euron Open LMS Mobile contributors"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"
  s.frameworks   = "Network"

  install_modules_dependencies(s)
end
