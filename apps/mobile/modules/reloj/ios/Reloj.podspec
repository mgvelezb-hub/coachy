Pod::Spec.new do |s|
  s.name           = 'Reloj'
  s.version        = '1.0.0'
  s.summary        = 'Puente WatchConnectivity entre Holy Gains y el Apple Watch.'
  s.description    = s.summary
  s.author         = 'Holy Gains'
  s.homepage       = 'https://holygains.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
