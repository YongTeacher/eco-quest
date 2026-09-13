(function () {
  "use strict";

  var loginScreen = document.getElementById("login-screen");
  var studentApp = document.getElementById("student-app");
  var teacherApp = document.getElementById("teacher-app");
  var toast = document.getElementById("toast");
  var toastTimer;
  var photos = [];
  var dexLimit = 3;
  var currentClass = "all";
  var currentFilter = "all";
  var kakaoMap;
  var kakaoMapLoading = false;
  var currentLocationMarker;
  var observationMarkers = [];
  var schoolPosition = { lat: 37.2947967, lng: 127.2404688 };
  var locationPickerMap;
  var locationPickerMarker;
  var pendingLocation;
  var selectedLocation;
  var pickerPreviousFocus;
  var currentUser;
  var observations = [];
  var guides = [];
  var selectedSpecies;
  var selectedGuideObservation;
  var markerClusterer;
  var candidatePhotoCache = {};
  var guideCardMap;
  var guideCardMarker;
  var guideCardMapRequest = 0;

  function api(path, options) {
    var requestOptions = options || {};
    requestOptions.credentials = "same-origin";
    return window.fetch("/api/eco/" + path, requestOptions).then(function (response) {
      return response.json().catch(function () { return { ok: false, error: "서버 응답을 읽을 수 없습니다." }; }).then(function (body) {
        if (!response.ok || !body.ok) {
          var error = new Error(body.error || "요청을 처리하지 못했습니다.");
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  var candidateData = {
    plant: [
      { name: "서양민들레", scientific: "Taraxacum officinale", clue: "바깥쪽 총포 조각이 아래로 젖혀짐", confidence: "가능성 높음", icon: "✿" },
      { name: "민들레", scientific: "Taraxacum platycarpum", clue: "총포 조각이 곧게 붙고 꽃이 선명한 노란색", confidence: "비교 필요", icon: "✿" },
      { name: "씀바귀", scientific: "Ixeridium dentatum", clue: "줄기가 갈라지고 꽃잎 수가 비교적 적음", confidence: "가능성 낮음", icon: "♧" }
    ],
    insect: [
      { name: "배추흰나비", scientific: "Pieris rapae", clue: "흰 날개와 앞날개의 검은 점", confidence: "가능성 높음", icon: "◆" },
      { name: "대만흰나비", scientific: "Pieris canidia", clue: "날개 시맥을 따라 검은 무늬가 발달", confidence: "비교 필요", icon: "◇" },
      { name: "큰줄흰나비", scientific: "Pieris melete", clue: "날개 뒷면의 시맥 무늬가 뚜렷함", confidence: "가능성 낮음", icon: "◆" }
    ],
    bird: [
      { name: "직박구리", scientific: "Hypsipetes amaurotis", clue: "회갈색 몸과 뾰족한 머리깃", confidence: "가능성 높음", icon: "⌁" },
      { name: "참새", scientific: "Passer montanus", clue: "갈색 머리와 흰 뺨의 검은 점", confidence: "비교 필요", icon: "⌁" },
      { name: "찌르레기", scientific: "Spodiopsar cineraceus", clue: "회색 몸과 주황색 부리", confidence: "가능성 낮음", icon: "⌁" }
    ],
    animal: [
      { name: "청설모", scientific: "Sciurus vulgaris", clue: "붉은빛 털과 길고 풍성한 꼬리", confidence: "가능성 높음", icon: "♞" },
      { name: "다람쥐", scientific: "Eutamias sibiricus", clue: "등에 다섯 개의 검은 줄무늬", confidence: "비교 필요", icon: "♞" },
      { name: "족제비", scientific: "Mustela sibirica", clue: "길쭉한 몸과 짧은 다리", confidence: "가능성 낮음", icon: "♞" }
    ],
    water: [
      { name: "참개구리", scientific: "Pelophylax nigromaculatus", clue: "등의 검은 반점과 뚜렷한 등주름", confidence: "가능성 높음", icon: "●" },
      { name: "금개구리", scientific: "Pelophylax chosenicus", clue: "등 양쪽의 금색 융기선", confidence: "확인 필요", icon: "●" },
      { name: "청개구리", scientific: "Dryophytes japonicus", clue: "작은 몸과 발가락 끝 흡반", confidence: "가능성 낮음", icon: "●" }
    ],
    fungi: [
      { name: "구름버섯", scientific: "Trametes versicolor", clue: "부채꼴 갓에 여러 색의 둥근 무늬", confidence: "가능성 높음", icon: "♠" },
      { name: "치마버섯", scientific: "Schizophyllum commune", clue: "회백색 부채꼴 갓과 갈라진 주름", confidence: "비교 필요", icon: "♠" },
      { name: "말불버섯", scientific: "Lycoperdon perlatum", clue: "둥근 자실체 표면의 작은 돌기", confidence: "가능성 낮음", icon: "♠" }
    ],
    etc: [
      { name: "미확인 생물 A", scientific: "Taxon incertae sedis", clue: "사진과 관찰 특징을 추가로 비교하세요", confidence: "추가 조사", icon: "?" },
      { name: "미확인 생물 B", scientific: "Unidentified organism", clue: "다른 각도의 사진이 필요합니다", confidence: "추가 조사", icon: "?" },
      { name: "직접 동정하기", scientific: "Manual identification", clue: "도감이나 생물 데이터베이스에서 검색하세요", confidence: "학생 조사", icon: "⌕" }
    ]
  };

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }

  function showStudent(viewName) {
    loginScreen.hidden = true;
    teacherApp.hidden = true;
    studentApp.hidden = false;
    renderCurrentUser();
    setView(viewName || "home");
    window.scrollTo(0, 0);
    loadStudentData();
  }

  function showTeacher() {
    loginScreen.hidden = true;
    studentApp.hidden = true;
    teacherApp.hidden = false;
    loadAdminOverview();
    window.scrollTo(0, 0);
  }

  function showLogin() {
    studentApp.hidden = true;
    teacherApp.hidden = true;
    loginScreen.hidden = false;
    currentUser = null;
    window.scrollTo(0, 0);
  }

  function setView(name) {
    document.querySelectorAll(".app-view").forEach(function (view) {
      view.classList.toggle("active", view.id === "view-" + name);
    });
    document.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "map") window.setTimeout(ensureKakaoMap, 0);
  }

  document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var button = this.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "입장 확인 중…";
    api("auth/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_code: document.getElementById("class-code").value.trim(),
        class_number: document.getElementById("class-number").value,
        student_number: document.getElementById("student-number").value,
        student_name: document.getElementById("student-name").value.trim(),
        group_number: document.getElementById("group-number").value,
        pin: document.getElementById("student-pin").value
      })
    }).then(function (result) {
      currentUser = result.user;
      showStudent("home");
      showToast(currentUser.class_number + "반 ECO QUEST에 입장했습니다.");
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.innerHTML = '탐사 시작하기 <span aria-hidden="true">→</span>';
    });
  });

  document.getElementById("teacher-preview").addEventListener("click", function () {
    var password = window.prompt("교사 관리자 비밀번호를 입력하세요.");
    if (!password) return;
    api("auth/teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password })
    }).then(function (result) {
      currentUser = result.user;
      showTeacher();
      showToast("교사 관리자 화면에 로그인했습니다.");
    }).catch(function (error) { showToast(error.message); });
  });

  function logout() {
    api("auth/logout", { method: "POST" }).catch(function () {}).finally(function () {
      showLogin();
      showToast("로그아웃했습니다.");
    });
  }

  document.getElementById("exit-teacher").addEventListener("click", logout);
  document.getElementById("logout-button").addEventListener("click", logout);

  function renderCurrentUser() {
    if (!currentUser || currentUser.role !== "student") return;
    var initials = currentUser.student_name.slice(0, 2);
    document.getElementById("student-class-badge").textContent = currentUser.class_number + "반 · " + currentUser.group_number + "모둠";
    document.getElementById("student-avatar").textContent = initials;
    document.getElementById("home-student-name").textContent = currentUser.student_name;
    document.getElementById("discover-team-pill").textContent = currentUser.class_number + "반 · " + currentUser.group_number + "모둠";
    document.getElementById("profile-avatar").textContent = initials;
    document.getElementById("profile-name").textContent = currentUser.student_name;
    document.getElementById("profile-meta").textContent = currentUser.class_number + "반 " + String(currentUser.student_number).padStart(2, "0") + "번 · " + currentUser.group_number + "모둠";
    dexLimit = Number(currentUser.guide_limit || 3);
    document.getElementById("dex-limit").textContent = dexLimit;
  }

  function restoreSession() {
    api("me").then(function (result) {
      currentUser = result.user;
      if (currentUser.role === "teacher") showTeacher();
      else showStudent("home");
    }).catch(function () { showLogin(); });
  }

  document.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view]");
    var goButton = event.target.closest("[data-go]");
    if (viewButton && !studentApp.hidden) setView(viewButton.dataset.view);
    if (goButton && !studentApp.hidden) setView(goButton.dataset.go);
  });

  /* Kakao map, tabs and filters */
  function showMapLoadError(message) {
    var loading = document.getElementById("map-loading");
    loading.classList.add("error");
    loading.innerHTML = '<span class="compass-icon">!</span><b>카카오맵을 불러오지 못했습니다</b><small>' + escapeHtml(message) + '<br>위의 “카카오맵에서 열기”로 학교 위치를 확인할 수 있습니다.</small>';
  }

  function renderSchoolInspector() {
    document.getElementById("map-inspector").innerHTML =
      '<div class="inspector-content">' +
        '<div class="place-visual"><span>⌂</span></div>' +
        '<span class="pixel-label">EXPEDITION BASE</span>' +
        '<h3>용인삼계고등학교</h3>' +
        '<p>생태 탐사의 기준 위치입니다. 학생 관찰이 등록되면 실제 발견 지점에 핀이 생성됩니다.</p>' +
        '<div class="species-list"><h4>학교 주소</h4><span>경기도 용인시 처인구 포곡읍 백옥대로1898번길 34-42</span></div>' +
      '</div>';
  }

  function ensureKakaoMap() {
    if (kakaoMap) {
      kakaoMap.relayout();
      return;
    }
    if (kakaoMapLoading) return;
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      showMapLoadError("JavaScript 키 또는 등록 도메인을 확인해 주세요.");
      return;
    }

    kakaoMapLoading = true;
    window.kakao.maps.load(function () {
      try {
        var center = new window.kakao.maps.LatLng(schoolPosition.lat, schoolPosition.lng);
        kakaoMap = new window.kakao.maps.Map(document.getElementById("kakao-map"), {
          center: center,
          level: 4
        });
        kakaoMap.addControl(new window.kakao.maps.MapTypeControl(), window.kakao.maps.ControlPosition.TOPRIGHT);
        kakaoMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);
        markerClusterer = new window.kakao.maps.MarkerClusterer({
          map: kakaoMap,
          averageCenter: true,
          minLevel: 1,
          disableClickZoom: false
        });

        var schoolMarker = new window.kakao.maps.Marker({
          map: kakaoMap,
          position: center,
          title: "용인삼계고등학교"
        });
        var label = document.createElement("button");
        label.className = "school-map-label";
        label.type = "button";
        label.textContent = "용인삼계고등학교";
        label.addEventListener("click", renderSchoolInspector);
        new window.kakao.maps.CustomOverlay({
          map: kakaoMap,
          position: center,
          content: label,
          yAnchor: 0
        });
        window.kakao.maps.event.addListener(schoolMarker, "click", renderSchoolInspector);

        document.getElementById("map-loading").hidden = true;
        kakaoMapLoading = false;
        rebuildObservationMarkers();
      } catch (error) {
        kakaoMapLoading = false;
        showMapLoadError("지도 초기화 중 오류가 발생했습니다.");
      }
    });
  }

  document.querySelectorAll(".class-tabs button").forEach(function (button) {
    button.addEventListener("click", function () {
      currentClass = button.dataset.class;
      document.querySelectorAll(".class-tabs button").forEach(function (item) {
        var selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
      updateMarkers();
    });
  });

  document.querySelectorAll(".filter-row button").forEach(function (button) {
    button.addEventListener("click", function () {
      currentFilter = button.dataset.filter;
      document.querySelectorAll(".filter-row button").forEach(function (item) {
        item.classList.toggle("active", item === button);
      });
      updateMarkers();
    });
  });

  function updateMarkers() {
    var visibleMarkers = [];
    observationMarkers.forEach(function (item) {
      var classMatches = currentClass === "all" || String(item.data.class_number) === currentClass;
      var kindMatches = currentFilter === "all" || item.kind === currentFilter;
      var visible = classMatches && kindMatches;
      item.marker.setMap(null);
      if (visible) visibleMarkers.push(item.marker);
    });
    if (markerClusterer) {
      markerClusterer.clear();
      markerClusterer.addMarkers(visibleMarkers);
    }
    var visibleCount = visibleMarkers.length;
    var classText = currentClass === "all" ? "9개 반" : currentClass + "반";
    var filterText = currentFilter === "all" ? "전체 분류" : document.querySelector('[data-filter="' + currentFilter + '"]').textContent.trim();
    document.getElementById("map-summary").textContent = classText + " · " + filterText + " · 관찰 " + visibleCount + "건";
    document.getElementById("map-total-count").textContent = visibleCount;
    document.getElementById("map-inspector").innerHTML = '<div class="inspector-placeholder"><span class="compass-icon">⌖</span><h3>핀을 선택해 보세요</h3><p>현재 필터에 맞는 장소의 생물 기록을 확인할 수 있습니다.</p></div>';
  }

  function rebuildObservationMarkers() {
    if (!kakaoMap) return;
    if (markerClusterer) markerClusterer.clear();
    observationMarkers.forEach(function (item) { item.marker.setMap(null); });
    observationMarkers = observations.map(function (observation) {
      var marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(Number(observation.latitude), Number(observation.longitude)),
        title: observation.species_name
      });
      window.kakao.maps.event.addListener(marker, "click", function () { renderObservationInspector(observation); });
      return { marker: marker, kind: observation.category === "etc" ? "unknown" : observation.category, data: observation };
    });
    updateMarkers();
  }

  function renderObservationInspector(observation) {
    var existingGuide = guides.find(function (guide) { return guide.observation_id === observation.id; });
    var guideButtonLabel = existingGuide ? "내 생물도감 수정하기" : "이 생물로 개인 도감 만들기";
    document.getElementById("map-inspector").innerHTML =
      '<div class="inspector-content">' +
        '<img class="observation-photo" src="' + escapeHtml(observation.photo_url) + '" alt="' + escapeHtml(observation.species_name) + ' 대표 사진" />' +
        '<span class="pixel-label">' + escapeHtml(categoryLabel(observation.category)) + '</span>' +
        '<h3>' + escapeHtml(observation.species_name) + '</h3>' +
        '<p><i>' + escapeHtml(observation.scientific_name || "학명 미기록") + '</i></p>' +
        '<div class="species-list"><h4>발견 기록</h4><span>' + escapeHtml(observation.place_name) + '</span><span>' + escapeHtml(observation.class_number + "반 " + observation.group_number + "모둠 · " + observation.student_name) + '</span></div>' +
        '<button class="primary-button inspector-guide-button" type="button" data-make-guide="' + escapeHtml(observation.id) + '">' + guideButtonLabel + '</button>' +
      '</div>';
  }

  function safeExternalUrl(value) {
    try {
      var url = new URL(String(value || ""));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function categoryLabel(category) {
    return { plant: "식물", insect: "곤충", bird: "조류", animal: "포유류", water: "양서·파충류·수생생물", fungi: "균류", etc: "기타" }[category] || "미확인";
  }

  function loadStudentData() {
    if (!currentUser || currentUser.role !== "student") return;
    Promise.all([api("observations"), api("guides")]).then(function (results) {
      observations = results[0].observations || [];
      guides = results[1].guides || [];
      dexLimit = Number(results[1].guide_limit || currentUser.guide_limit || 3);
      renderStudentSummary();
      renderGuides();
      rebuildObservationMarkers();
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  function renderStudentSummary() {
    var mine = observations.filter(function (item) { return item.student_id === currentUser.id; });
    var team = observations.filter(function (item) {
      return Number(item.class_number) === Number(currentUser.class_number) && Number(item.group_number) === Number(currentUser.group_number);
    });
    document.getElementById("team-observation-count").textContent = team.length;
    document.getElementById("home-observation-count").textContent = mine.length;
    document.getElementById("home-category-count").textContent = new Set(mine.map(function (item) { return item.category; })).size;
    document.getElementById("all-observation-count").textContent = observations.length;
    document.getElementById("home-guide-count").innerHTML = guides.length + "<small>/" + dexLimit + "</small>";

    var recent = observations.filter(function (item) { return Number(item.class_number) === Number(currentUser.class_number); }).slice(0, 3);
    document.getElementById("recent-observations").innerHTML = recent.length ? recent.map(function (item) {
      return '<button type="button" data-go="map"><span class="species-thumb ' + escapeHtml(item.category) + '">⌖</span><span><b>' + escapeHtml(item.species_name) + '</b><small>' + escapeHtml(item.place_name) + ' · ' + formatDate(item.created_at) + '</small></span><em>' + escapeHtml(categoryLabel(item.category)) + '</em></button>';
    }).join("") : '<p class="empty-message">아직 등록된 관찰이 없습니다.</p>';

    document.querySelectorAll(".class-bars span").forEach(function (bar, index) {
      var count = observations.filter(function (item) { return Number(item.class_number) === index + 1; }).length;
      bar.style.height = Math.max(10, Math.min(100, count * 8)) + "%";
      bar.classList.toggle("mine", index + 1 === Number(currentUser.class_number));
    });
  }

  function renderGuides() {
    var grid = document.getElementById("dex-grid");
    var cards = guides.map(function (guide, index) {
      return '<button class="dex-card complete" type="button" data-guide-index="' + index + '" aria-label="' + escapeHtml(guide.species_name) + ' 생물도감 자세히 보기"><div class="dex-image"><img src="' + escapeHtml(guide.photo_url) + '" alt="' + escapeHtml(guide.species_name) + '" /><em>NO. ' + String(index + 1).padStart(3, "0") + '</em></div><div class="dex-body"><div><span class="type-chip">' + escapeHtml(categoryLabel(guide.category)) + '</span><span class="verified">작성 완료</span></div><h3>' + escapeHtml(guide.species_name) + '</h3><p>' + escapeHtml(guide.scientific_name || "학명 미기록") + '</p><small>' + formatDate(guide.updated_at) + ' · 카드 보기</small></div></button>';
    });
    if (guides.length < dexLimit) cards.push('<button class="empty-dex-card" type="button" data-go="map"><span>＋</span><h3>새 도감 만들기</h3><p>공동 관찰에서 생물을 선택하세요.</p></button>');
    grid.innerHTML = cards.join("");
    updateDexProgress();
  }

  function showGuideMapError(message) {
    var loading = document.getElementById("guide-location-map-loading");
    if (!loading) return;
    loading.hidden = false;
    loading.classList.add("error");
    loading.textContent = message;
  }

  function renderGuideLocationMap(latitude, longitude, placeName) {
    var requestId = ++guideCardMapRequest;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      showGuideMapError("발견 위치 좌표가 기록되지 않았습니다.");
      return;
    }
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      showGuideMapError("카카오맵을 불러오지 못했습니다.");
      return;
    }
    window.kakao.maps.load(function () {
      window.setTimeout(function () {
        var container = document.getElementById("guide-location-map");
        if (requestId !== guideCardMapRequest || !container || document.getElementById("guide-card-modal").hidden) return;
        try {
          var position = new window.kakao.maps.LatLng(latitude, longitude);
          guideCardMap = new window.kakao.maps.Map(container, {
            center: position,
            level: 3
          });
          guideCardMarker = new window.kakao.maps.Marker({
            map: guideCardMap,
            position: position,
            title: placeName
          });
          guideCardMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);
          document.getElementById("guide-location-map-loading").hidden = true;
          guideCardMap.relayout();
          guideCardMap.setCenter(position);
        } catch (_error) {
          showGuideMapError("발견 위치 지도를 표시하지 못했습니다.");
        }
      }, 0);
    });
  }

  function openGuideCard(guide, index) {
    var observation = observations.find(function (item) { return item.id === guide.observation_id; }) || {};
    var placeName = guide.place_name || observation.place_name || "장소 미기록";
    var latitude = Number(guide.latitude || observation.latitude);
    var longitude = Number(guide.longitude || observation.longitude);
    var hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    var kakaoMapUrl = hasCoordinates
      ? "https://map.kakao.com/link/map/" + encodeURIComponent(placeName) + "," + latitude + "," + longitude
      : "";
    var sourceUrl = safeExternalUrl(guide.source);
    var sourceHtml = sourceUrl
      ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(guide.source) + '</a>'
      : escapeHtml(guide.source || "참고 자료 미기록");
    var detail = document.getElementById("guide-card-detail");
    detail.className = "field-guide-infographic card-" + escapeHtml(guide.category || "etc");
    detail.innerHTML =
      '<header class="field-guide-card-head"><div><span class="pixel-label">ECO QUEST FIELD CARD</span><h2 id="guide-card-title">' + escapeHtml(guide.species_name) + '</h2><p>' + escapeHtml(guide.scientific_name || "학명 미기록") + '</p></div><div class="field-guide-number"><small>ARCHIVE</small><b>NO. ' + String(index + 1).padStart(3, "0") + '</b></div></header>' +
      '<div class="field-guide-hero"><img src="' + escapeHtml(guide.photo_url) + '" alt="' + escapeHtml(guide.species_name) + ' 대표 사진" /><span>' + escapeHtml(categoryLabel(guide.category)) + ' · ' + escapeHtml(placeName) + '</span></div>' +
      '<section class="field-guide-location"><div class="field-guide-location-head"><div><h3>DISCOVERY MAP · 발견 위치</h3><p>⌖ ' + escapeHtml(placeName) + '</p></div>' + (kakaoMapUrl ? '<a href="' + escapeHtml(kakaoMapUrl) + '" target="_blank" rel="noopener noreferrer">카카오맵에서 크게 보기 ↗</a>' : '') + '</div><div class="field-guide-location-map-wrap"><div id="guide-location-map" class="field-guide-location-map" aria-label="' + escapeHtml(placeName) + ' 발견 위치 지도"></div><div id="guide-location-map-loading" class="field-guide-location-map-loading">발견 위치 지도를 불러오는 중입니다…</div></div></section>' +
      '<div class="field-guide-facts">' +
        '<section class="field-guide-fact"><h3>HABITAT · 서식지</h3><p>' + escapeHtml(guide.habitat || "서식지 미기록") + '</p></section>' +
        '<section class="field-guide-fact"><h3>KEY FEATURES · 주요 특징</h3><p>' + escapeHtml(guide.key_features || "주요 특징 미기록") + '</p></section>' +
        '<section class="field-guide-fact full"><h3>ECOLOGICAL ROLE · 생태계 역할</h3><p>' + escapeHtml(guide.ecological_role || "생태계 역할 미기록") + '</p></section>' +
        '<section class="field-guide-fact full"><h3>FIELD REPORT · 조사 보고서</h3><p>' + escapeHtml(guide.report || "조사 보고서 미기록") + '</p></section>' +
        '<section class="field-guide-fact full"><h3>SOURCE · 참고 자료</h3><p>' + sourceHtml + '</p></section>' +
      '</div>' +
      '<footer class="field-guide-card-foot"><span><b>' + escapeHtml(currentUser.student_name) + '</b> 탐사대원의 개인 생물도감</span><span>' + escapeHtml(formatDate(guide.updated_at)) + ' · 용인삼계고등학교</span></footer>';
    document.getElementById("guide-card-modal").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("close-guide-card").focus();
    renderGuideLocationMap(latitude, longitude, placeName);
  }

  function closeGuideCard() {
    guideCardMapRequest += 1;
    document.getElementById("guide-card-modal").hidden = true;
    document.body.classList.remove("modal-open");
    guideCardMarker = null;
    guideCardMap = null;
  }

  document.getElementById("dex-grid").addEventListener("click", function (event) {
    var card = event.target.closest("[data-guide-index]");
    if (!card) return;
    var index = Number(card.dataset.guideIndex);
    if (guides[index]) openGuideCard(guides[index], index);
  });

  document.getElementById("close-guide-card").addEventListener("click", closeGuideCard);
  document.getElementById("guide-card-modal").addEventListener("click", function (event) {
    if (event.target === this) closeGuideCard();
  });

  function openGuideEditor(observation) {
    var existingGuide = guides.find(function (guide) { return guide.observation_id === observation.id; });
    if (!existingGuide && guides.length >= dexLimit) {
      showToast("허용된 생물도감 수를 모두 작성했습니다.");
      return;
    }
    selectedGuideObservation = observation;
    document.getElementById("guide-editor-title").textContent = existingGuide ? "개인 생물도감 수정" : "개인 생물도감 작성";
    document.getElementById("guide-selected-observation").innerHTML =
      '<img src="' + escapeHtml(observation.photo_url) + '" alt="' + escapeHtml(observation.species_name) + ' 대표 사진" />' +
      '<div><span class="pixel-label">' + escapeHtml(categoryLabel(observation.category)) + '</span><h3>' + escapeHtml(observation.species_name) + '</h3><p>' + escapeHtml(observation.scientific_name || "학명 미기록") + '</p><small>' + escapeHtml(observation.place_name) + '</small></div>';
    document.getElementById("guide-habitat").value = existingGuide ? existingGuide.habitat : "";
    document.getElementById("guide-key-features").value = existingGuide ? existingGuide.key_features : observation.features || "";
    document.getElementById("guide-ecological-role").value = existingGuide ? existingGuide.ecological_role : "";
    document.getElementById("guide-report").value = existingGuide ? existingGuide.report : "";
    document.getElementById("guide-source").value = existingGuide ? existingGuide.source : observation.source || "";
    document.getElementById("save-guide").textContent = existingGuide ? "수정 내용 저장하기" : "생물도감 완성하기";
    document.getElementById("guide-editor-modal").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("guide-habitat").focus();
  }

  function closeGuideEditor() {
    document.getElementById("guide-editor-modal").hidden = true;
    document.body.classList.remove("modal-open");
    document.getElementById("guide-form").reset();
    selectedGuideObservation = null;
  }

  document.getElementById("map-inspector").addEventListener("click", function (event) {
    var button = event.target.closest("[data-make-guide]");
    if (!button) return;
    var observation = observations.find(function (item) { return item.id === button.dataset.makeGuide; });
    if (observation) openGuideEditor(observation);
  });

  document.getElementById("close-guide-editor").addEventListener("click", closeGuideEditor);
  document.getElementById("cancel-guide-editor").addEventListener("click", closeGuideEditor);
  document.getElementById("guide-editor-modal").addEventListener("click", function (event) {
    if (event.target === this) closeGuideEditor();
  });

  document.getElementById("guide-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!selectedGuideObservation) return;
    var observationId = selectedGuideObservation.id;
    var button = document.getElementById("save-guide");
    button.disabled = true;
    button.textContent = "생물도감을 저장하는 중…";
    api("guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observation_id: observationId,
        habitat: document.getElementById("guide-habitat").value.trim(),
        key_features: document.getElementById("guide-key-features").value.trim(),
        ecological_role: document.getElementById("guide-ecological-role").value.trim(),
        report: document.getElementById("guide-report").value.trim(),
        source: document.getElementById("guide-source").value.trim()
      })
    }).then(function (result) {
      var savedGuide = Object.assign({ id: result.guide.guide_id }, result.guide);
      var existingIndex = guides.findIndex(function (guide) { return guide.observation_id === observationId; });
      if (existingIndex >= 0) guides.splice(existingIndex, 1, savedGuide);
      else guides.unshift(savedGuide);
      closeGuideEditor();
      renderGuides();
      renderStudentSummary();
      setView("dex");
      showToast("개인 생물도감과 Google Sheets 전송 대기열에 저장했습니다.");
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "생물도감 완성하기";
    });
  });

  function formatDate(value) {
    if (!value) return "";
    try { return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
    catch (_error) { return ""; }
  }

  document.getElementById("locate-button").addEventListener("click", function () {
    ensureKakaoMap();
    if (!navigator.geolocation) {
      showToast("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(function (position) {
      if (!kakaoMap) {
        showToast("지도를 불러온 뒤 다시 시도해 주세요.");
        return;
      }
      var location = new window.kakao.maps.LatLng(position.coords.latitude, position.coords.longitude);
      if (currentLocationMarker) currentLocationMarker.setMap(null);
      currentLocationMarker = new window.kakao.maps.Marker({ map: kakaoMap, position: location, title: "내 위치" });
      kakaoMap.panTo(location);
      showToast("현재 위치로 이동했습니다.");
    }, function () {
      showToast("위치 권한을 허용하면 현재 위치로 이동할 수 있습니다.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  /* Observation location picker */
  function updatePickerConfirmation() {
    var hasName = document.getElementById("specific-location-name").value.trim().length > 0;
    document.getElementById("confirm-location-picker").disabled = !(pendingLocation && hasName);
  }

  function setPickerPosition(latitude, longitude, moveMap) {
    pendingLocation = { lat: latitude, lng: longitude };
    var position = new window.kakao.maps.LatLng(latitude, longitude);
    if (locationPickerMarker) {
      locationPickerMarker.setPosition(position);
      locationPickerMarker.setMap(locationPickerMap);
    } else {
      locationPickerMarker = new window.kakao.maps.Marker({
        map: locationPickerMap,
        position: position,
        title: "선택한 발견 위치"
      });
    }
    if (moveMap) locationPickerMap.panTo(position);
    document.getElementById("picker-status").innerHTML = '<i class="live-dot"></i> 선택 위치 · ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6);
    updatePickerConfirmation();
  }

  function initializeLocationPickerMap() {
    var loading = document.getElementById("picker-map-loading");
    try {
      var start = pendingLocation || schoolPosition;
      var center = new window.kakao.maps.LatLng(start.lat, start.lng);
      if (!locationPickerMap) {
        locationPickerMap = new window.kakao.maps.Map(document.getElementById("location-picker-map"), {
          center: center,
          level: 3
        });
        locationPickerMap.addControl(new window.kakao.maps.MapTypeControl(), window.kakao.maps.ControlPosition.TOPRIGHT);
        locationPickerMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);
        window.kakao.maps.event.addListener(locationPickerMap, "click", function (mouseEvent) {
          setPickerPosition(mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng(), false);
        });
      } else {
        locationPickerMap.relayout();
        locationPickerMap.setCenter(center);
      }
      if (pendingLocation) {
        setPickerPosition(pendingLocation.lat, pendingLocation.lng, false);
      } else if (locationPickerMarker) {
        locationPickerMarker.setMap(null);
      }
      loading.hidden = true;
    } catch (error) {
      loading.hidden = false;
      loading.classList.add("error");
      loading.textContent = "카카오맵을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  function openLocationPicker() {
    var modal = document.getElementById("location-picker-modal");
    pickerPreviousFocus = document.activeElement;
    pendingLocation = selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : null;
    document.getElementById("specific-location-name").value = selectedLocation ? selectedLocation.name : "";
    document.getElementById("picker-status").innerHTML = '<i class="live-dot"></i> ' + (pendingLocation ? "저장된 핀을 확인하거나 새 위치를 눌러주세요." : "지도를 눌러 핀을 놓아주세요.");
    document.getElementById("picker-map-loading").hidden = false;
    document.getElementById("picker-map-loading").classList.remove("error");
    document.getElementById("picker-map-loading").textContent = "카카오맵을 불러오는 중입니다…";
    updatePickerConfirmation();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("close-location-picker").focus();

    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      var loading = document.getElementById("picker-map-loading");
      loading.classList.add("error");
      loading.textContent = "카카오맵 SDK를 불러오지 못했습니다.";
      return;
    }
    window.kakao.maps.load(function () {
      window.setTimeout(initializeLocationPickerMap, 0);
    });
  }

  function closeLocationPicker() {
    document.getElementById("location-picker-modal").hidden = true;
    document.body.classList.remove("modal-open");
    if (pickerPreviousFocus && typeof pickerPreviousFocus.focus === "function") pickerPreviousFocus.focus();
  }

  document.getElementById("open-location-picker").addEventListener("click", openLocationPicker);
  document.getElementById("observation-location").addEventListener("click", openLocationPicker);
  document.getElementById("close-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("cancel-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("location-picker-modal").addEventListener("click", function (event) {
    if (event.target === this) closeLocationPicker();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!document.getElementById("guide-card-modal").hidden) closeGuideCard();
    else if (!document.getElementById("guide-editor-modal").hidden) closeGuideEditor();
    else if (!document.getElementById("location-picker-modal").hidden) closeLocationPicker();
  });
  document.getElementById("specific-location-name").addEventListener("input", updatePickerConfirmation);

  document.getElementById("picker-current-location").addEventListener("click", function () {
    if (!navigator.geolocation) {
      showToast("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    var status = document.getElementById("picker-status");
    status.textContent = "현재 위치를 확인하는 중입니다…";
    navigator.geolocation.getCurrentPosition(function (position) {
      if (!locationPickerMap) {
        showToast("지도를 불러온 뒤 다시 시도해 주세요.");
        return;
      }
      setPickerPosition(position.coords.latitude, position.coords.longitude, true);
    }, function () {
      status.innerHTML = '<i class="live-dot"></i> 위치 권한을 허용하거나 지도에서 직접 선택해 주세요.';
      showToast("현재 위치를 가져오지 못했습니다.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  document.getElementById("confirm-location-picker").addEventListener("click", function () {
    var name = document.getElementById("specific-location-name").value.trim();
    if (!pendingLocation || !name) {
      showToast("지도 핀과 구체적인 장소명을 모두 입력해 주세요.");
      return;
    }
    selectedLocation = { lat: pendingLocation.lat, lng: pendingLocation.lng, name: name };
    document.getElementById("observation-location").value = name;
    document.getElementById("observation-latitude").value = selectedLocation.lat.toFixed(7);
    document.getElementById("observation-longitude").value = selectedLocation.lng.toFixed(7);
    var coordinate = document.getElementById("location-coordinate");
    coordinate.textContent = "핀 저장됨 · " + selectedLocation.lat.toFixed(6) + ", " + selectedLocation.lng.toFixed(6);
    coordinate.classList.add("selected");
    closeLocationPicker();
    showToast("발견 위치를 저장했습니다.");
  });

  /* Photo selection */
  function fileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.addEventListener("load", function () { resolve(reader.result); });
      reader.addEventListener("error", function () { reject(new Error("사진을 읽지 못했습니다.")); });
      reader.readAsDataURL(file);
    });
  }

  function optimizePhoto(file) {
    var uploadLimit = 8 * 1024 * 1024;
    var optimizeAbove = 1.5 * 1024 * 1024;
    if (!file || !String(file.type || "").startsWith("image/")) {
      return Promise.reject(new Error("이미지 파일만 등록할 수 있습니다."));
    }
    if (file.size <= optimizeAbove) return Promise.resolve(file);

    return new Promise(function (resolve, reject) {
      var image = new Image();
      var objectUrl = URL.createObjectURL(file);
      image.addEventListener("load", function () {
        var scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);

        var qualities = [0.82, 0.7, 0.58];
        var bestBlob;
        function encode(index) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              if (file.size <= uploadLimit) resolve(file);
              else reject(new Error("사진을 압축하지 못했습니다. 더 작은 사진을 선택해 주세요."));
              return;
            }
            if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
            if (blob.size <= optimizeAbove || index === qualities.length - 1) {
              var baseName = file.name.replace(/\.[^.]+$/, "") || "eco-photo";
              var optimized = new File([bestBlob], baseName + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
              if (optimized.size > uploadLimit) reject(new Error("압축 후에도 사진이 너무 큽니다. 다른 사진을 선택해 주세요."));
              else resolve(optimized.size < file.size ? optimized : file);
              return;
            }
            encode(index + 1);
          }, "image/jpeg", qualities[index]);
        }
        encode(0);
      });
      image.addEventListener("error", function () {
        URL.revokeObjectURL(objectUrl);
        if (file.size <= uploadLimit) resolve(file);
        else reject(new Error("이 사진 형식은 자동 압축할 수 없습니다. 8MB 이하 사진을 선택해 주세요."));
      });
      image.src = objectUrl;
    });
  }

  function preparePhoto(file) {
    return optimizePhoto(file).then(function (optimizedFile) {
      return fileAsDataUrl(optimizedFile).then(function (url) {
        return { file: optimizedFile, url: url };
      });
    });
  }

  document.getElementById("photo-input").addEventListener("change", function (event) {
    var selected = Array.prototype.slice.call(event.target.files || []).slice(0, 3 - photos.length);
    if (!selected.length) return;
    showToast("사진을 등록하기 좋게 최적화하는 중입니다…");
    Promise.all(selected.map(preparePhoto)).then(function (prepared) {
      photos = photos.concat(prepared).slice(0, 3);
      renderPhotos();
      showToast("사진 준비가 완료되었습니다. 첫 번째 사진이 대표 사진입니다.");
    }).catch(function (error) {
      showToast(error.message);
    });
    event.target.value = "";
  });

  function renderPhotos() {
    var list = document.getElementById("photo-list");
    var html = "";
    for (var i = 0; i < 3; i += 1) {
      if (photos[i]) {
        html += '<div class="photo-slot ' + (i === 0 ? "selected" : "") + '" data-photo-index="' + i + '"><img src="' + photos[i].url + '" alt="선택한 생물 사진 ' + (i + 1) + '" /><button class="remove-photo" type="button" data-remove-photo="' + i + '" aria-label="사진 삭제">×</button></div>';
      } else {
        html += '<div class="photo-slot empty"><span>＋</span><small>사진 ' + (i + 1) + '</small></div>';
      }
    }
    list.innerHTML = html;
  }

  document.getElementById("photo-list").addEventListener("click", function (event) {
    var removeButton = event.target.closest("[data-remove-photo]");
    var slot = event.target.closest("[data-photo-index]");
    if (removeButton) {
      event.stopPropagation();
      photos.splice(Number(removeButton.dataset.removePhoto), 1);
      renderPhotos();
      return;
    }
    if (slot) {
      var index = Number(slot.dataset.photoIndex);
      var chosen = photos.splice(index, 1)[0];
      photos.unshift(chosen);
      renderPhotos();
      showToast("대표 사진으로 선택했습니다.");
    }
  });

  /* Mock AI analysis */
  document.getElementById("analyze-button").addEventListener("click", function () {
    var category = document.getElementById("category-select").value;
    var features = document.getElementById("feature-input").value.trim();
    if (!photos.length) {
      showToast("분석할 생물 사진을 한 장 이상 선택해 주세요.");
      return;
    }
    if (!selectedLocation) {
      showToast("지도에서 생물을 발견한 위치를 먼저 선택해 주세요.");
      return;
    }
    if (!category || !features) {
      showToast("생물의 분류와 관찰한 특징을 입력해 주세요.");
      return;
    }
    var button = this;
    button.disabled = true;
    button.innerHTML = "사진과 특징을 비교하는 중…";
    window.setTimeout(function () {
      renderCandidates(candidateData[category] || candidateData.etc);
      document.getElementById("candidate-section").hidden = false;
      button.disabled = false;
      button.innerHTML = "다시 분석하기 <span>✦</span>";
      document.getElementById("candidate-section").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 850);
  });

  function renderCandidates(items) {
    document.getElementById("candidate-list").innerHTML = items.map(function (item, index) {
      return '<article class="candidate-card" tabindex="0" role="button" data-candidate-index="' + index + '" data-name="' + escapeHtml(item.name) + '" data-scientific="' + escapeHtml(item.scientific) + '">' +
        '<span class="rank">0' + (index + 1) + '</span>' +
        '<div class="candidate-photo"><span class="candidate-photo-placeholder">' + item.icon + '</span><img data-candidate-image="' + index + '" alt="' + escapeHtml(item.name) + ' 대표 사진" loading="lazy" hidden /></div>' +
        '<h4>' + escapeHtml(item.name) + '</h4><p>' + escapeHtml(item.scientific) + '</p><small>' + escapeHtml(item.clue) + '</small><span class="confidence">' + escapeHtml(item.confidence) + '</span>' +
        '<a class="candidate-photo-credit" data-candidate-credit="' + index + '" target="_blank" rel="noopener noreferrer" hidden></a>' +
      '</article>';
    }).join("");
    loadCandidatePhotos(items);
  }

  function candidatePhotoData(photo) {
    var allowedLicenses = new Set(["cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"]);
    if (!photo || !photo.license_code || !allowedLicenses.has(String(photo.license_code).toLowerCase())) return null;
    var imageUrl = photo.medium_url || String(photo.url || "").replace(/\/square\./, "/medium.");
    if (!imageUrl) return null;
    return {
      imageUrl: imageUrl,
      detailUrl: "https://www.inaturalist.org/photos/" + photo.id,
      credit: "사진: " + (photo.attribution_name || String(photo.attribution || "").replace(/^\(c\)\s*/i, "").split(",")[0] || "iNaturalist 관찰자") + " · " + photo.license_code.toUpperCase()
    };
  }

  function findLicensedObservationPhoto(scientificName) {
    var licenses = "cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa";
    var endpoint = "https://api.inaturalist.org/v1/observations?taxon_name=" + encodeURIComponent(scientificName) + "&photos=true&photo_license=" + encodeURIComponent(licenses) + "&quality_grade=research&order_by=votes&per_page=1";
    return window.fetch(endpoint).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).then(function (body) {
      var observation = body && body.results && body.results[0];
      return candidatePhotoData(observation && observation.photos && observation.photos[0]);
    }).catch(function () { return null; });
  }

  function findLicensedTaxonPhoto(scientificName) {
    if (candidatePhotoCache[scientificName]) return candidatePhotoCache[scientificName];
    var endpoint = "https://api.inaturalist.org/v1/taxa?q=" + encodeURIComponent(scientificName) + "&rank=species&per_page=10";
    candidatePhotoCache[scientificName] = window.fetch(endpoint).then(function (response) {
      if (!response.ok) throw new Error("대표 사진 조회 실패");
      return response.json();
    }).then(function (body) {
      var results = body.results || [];
      var taxon = results.find(function (item) {
        return String(item.name || "").toLowerCase() === scientificName.toLowerCase() || String(item.matched_term || "").toLowerCase() === scientificName.toLowerCase();
      });
      var photo = taxon && taxon.default_photo;
      return candidatePhotoData(photo) || findLicensedObservationPhoto(scientificName);
    }).catch(function () { return null; });
    return candidatePhotoCache[scientificName];
  }

  function loadCandidatePhotos(items) {
    items.forEach(function (item, index) {
      if (/^(Taxon incertae sedis|Unidentified organism|Manual identification)$/i.test(item.scientific)) return;
      findLicensedTaxonPhoto(item.scientific).then(function (photo) {
        if (!photo) return;
        var card = document.querySelector('.candidate-card[data-candidate-index="' + index + '"]');
        if (!card || card.dataset.scientific !== item.scientific) return;
        var image = card.querySelector('[data-candidate-image="' + index + '"]');
        var credit = card.querySelector('[data-candidate-credit="' + index + '"]');
        if (!image || !credit) return;
        image.addEventListener("load", function () {
          image.hidden = false;
          var placeholder = image.parentElement.querySelector(".candidate-photo-placeholder");
          if (placeholder) placeholder.hidden = true;
        }, { once: true });
        image.addEventListener("error", function () {
          credit.hidden = true;
        }, { once: true });
        image.src = photo.imageUrl;
        credit.href = photo.detailUrl;
        credit.textContent = photo.credit;
        credit.title = photo.credit + " · iNaturalist에서 사진 정보 보기";
        credit.hidden = false;
      });
    });
  }

  document.getElementById("candidate-list").addEventListener("click", function (event) {
    if (event.target.closest(".candidate-photo-credit")) return;
    var card = event.target.closest(".candidate-card");
    if (!card) return;
    document.querySelectorAll(".candidate-card").forEach(function (item) { item.classList.toggle("selected", item === card); });
    selectSpecies(card.dataset.name, card.dataset.scientific);
  });

  document.getElementById("candidate-list").addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(".candidate-photo-credit")) return;
    var card = event.target.closest(".candidate-card");
    if (!card) return;
    event.preventDefault();
    card.click();
  });

  document.getElementById("manual-identify").addEventListener("click", function () {
    var name = window.prompt("조사한 생물 이름을 입력하세요.", "");
    if (!name) return;
    selectSpecies(name, "학명 데이터베이스 확인 예정");
  });

  function selectSpecies(name, scientific) {
    selectedSpecies = { name: name, scientific: scientific };
    document.getElementById("selected-species").innerHTML = "<b>최종 후보 · " + escapeHtml(name) + "</b><span>" + escapeHtml(scientific) + "</span>";
    document.getElementById("research-section").hidden = false;
    document.getElementById("research-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.getElementById("finalize-button").addEventListener("click", function () {
    var reason = document.getElementById("reason-input").value.trim();
    var source = document.getElementById("source-input").value.trim();
    var checked = document.getElementById("research-check").checked;
    if (!selectedSpecies || !reason || !source || !checked) {
      showToast("동정 근거, 참고 자료와 조사 확인을 모두 작성해 주세요.");
      return;
    }
    if (!photos.length || !selectedLocation) {
      showToast("대표 사진과 발견 위치를 다시 확인해 주세요.");
      return;
    }
    var button = this;
    var form = new FormData();
    form.append("photo", photos[0].file, photos[0].file.name);
    form.append("latitude", selectedLocation.lat);
    form.append("longitude", selectedLocation.lng);
    form.append("place_name", selectedLocation.name);
    form.append("category", document.getElementById("category-select").value);
    form.append("species_name", selectedSpecies.name);
    form.append("scientific_name", selectedSpecies.scientific);
    form.append("features", document.getElementById("feature-input").value.trim());
    form.append("identification_reason", reason);
    form.append("source", source);
    button.disabled = true;
    button.textContent = "사진과 기록을 저장하는 중…";
    api("observations", { method: "POST", body: form }).then(function (result) {
      observations.unshift(result.observation);
      resetObservationForm();
      renderStudentSummary();
      rebuildObservationMarkers();
      showToast("공동 관찰과 Google Sheets 전송 대기열에 등록했습니다.");
      window.setTimeout(function () { setView("map"); }, 500);
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.innerHTML = '학생 동정 완료로 등록 <span>→</span>';
    });
  });

  function resetObservationForm() {
    document.getElementById("observation-form").reset();
    photos = [];
    selectedSpecies = null;
    selectedLocation = null;
    pendingLocation = null;
    renderPhotos();
    document.getElementById("candidate-section").hidden = true;
    document.getElementById("research-section").hidden = true;
    document.getElementById("location-coordinate").textContent = "아직 위치가 선택되지 않았습니다.";
    document.getElementById("location-coordinate").classList.remove("selected");
  }

  /* Field guide slots */
  document.getElementById("add-dex-slot").addEventListener("click", function () {
    if (dexLimit >= 5) {
      showToast("이미 최대 5개의 도감을 작성할 수 있습니다.");
      return;
    }
    showToast("추가 도감 요청은 교사 승인 기능이 연결된 뒤 사용할 수 있습니다.");
  });

  function updateDexProgress() {
    var complete = guides.length;
    var percent = Math.round((complete / dexLimit) * 1000) / 10;
    document.getElementById("dex-limit").textContent = dexLimit;
    document.getElementById("dex-progress-text").textContent = complete + " / " + dexLimit;
    document.getElementById("dex-progress-bar").style.width = percent + "%";
    document.getElementById("side-progress-label").textContent = complete + " / " + dexLimit;
    document.getElementById("side-progress-bar").style.width = percent + "%";
    if (dexLimit >= 5) {
      document.getElementById("add-dex-slot").disabled = true;
      document.getElementById("add-dex-slot").innerHTML = "최대 5개의 도감 슬롯을 열었습니다";
    }
  }

  function loadAdminOverview() {
    api("admin/overview").then(function (result) {
      var classes = result.classes || [];
      var studentTotal = classes.reduce(function (sum, item) { return sum + item.students; }, 0);
      var observationTotal = classes.reduce(function (sum, item) { return sum + item.observations; }, 0);
      var guideTotal = classes.reduce(function (sum, item) { return sum + item.guides; }, 0);
      document.getElementById("admin-student-count").textContent = studentTotal;
      document.getElementById("admin-observation-count").textContent = observationTotal;
      document.getElementById("admin-guide-count").textContent = guideTotal;
      document.getElementById("admin-sync-count").textContent = result.pending_sync || 0;
      document.getElementById("class-overview").innerHTML = classes.map(function (item) {
        return '<div class="class-cell"><div><b>' + item.class_number + '반</b><span>' + item.students + '</span></div><p>관찰 ' + item.observations + '건 · 도감 ' + item.guides + '개</p></div>';
      }).join("");
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  document.getElementById("sync-sheets").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    button.textContent = "동기화 중…";
    api("admin/sync", { method: "POST" }).then(function (result) {
      showToast(result.attempted + "건 중 " + result.synced + "건을 동기화했습니다.");
      loadAdminOverview();
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "지금 동기화";
    });
  });

  document.querySelectorAll(".teacher-sidebar nav button").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll(".teacher-sidebar nav button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      if (button.textContent.indexOf("대시보드") === -1) showToast("세부 관리 화면은 다음 단계에서 연결됩니다.");
    });
  });

  restoreSession();
}());
