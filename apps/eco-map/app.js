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
  var pendingRosterRows = [];
  var rosterStudents = [];
  var qrPreviousFocus;
  var activeGuideIndex = -1;
  var editingObservation = null;
  var editLocation = null;
  var pickerTarget = "discover";
  var adminObservations = [];
  var adminGuides = [];
  var adminReflections = [];
  var adminMap;
  var adminMapClusterer;
  var adminMapMarkers = [];
  var adminRecordPreviousFocus;
  var currentReflection;

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
    setTeacherView("dashboard");
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
    if (name === "reflection") loadReflection();
  }

  function setTeacherView(name) {
    var labels = {
      dashboard: ["전체 수업 현황", "1반부터 9반까지의 생태 탐사 진행 상황입니다."],
      map: ["전체 생태지도", "학생들이 발견한 생물의 위치를 통합 또는 학급별로 확인합니다."],
      observations: ["모둠 관찰 기록", "학생들이 공동으로 등록한 발견 사진과 동정 기록을 확인합니다."],
      guides: ["개인 생물도감", "학생 개인별로 완성한 생물도감과 조사 내용을 확인합니다."],
      reflections: ["학생 소감문", "개인별 탐사 성찰 내용과 최종 제출 상태를 확인합니다."],
      roster: ["학생·모둠 관리", "등록된 학생을 확인하고 모둠 번호를 직접 배정할 수 있습니다."],
      settings: ["수업 설정", "학급 CSV 명단을 등록하고 로그인 준비 상태를 확인합니다."]
    };
    var selected = labels[name] ? name : "dashboard";
    document.querySelectorAll(".teacher-view").forEach(function (view) {
      view.hidden = view.id !== "teacher-view-" + selected;
    });
    document.querySelectorAll("[data-teacher-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.teacherView === selected);
    });
    document.getElementById("teacher-page-title").textContent = labels[selected][0];
    document.getElementById("teacher-page-subtitle").textContent = labels[selected][1];
    if (selected === "roster") loadRoster();
    if (selected === "map") loadAdminObservations(true);
    if (selected === "observations") loadAdminObservations(false);
    if (selected === "guides") loadAdminGuides();
    if (selected === "reflections") loadAdminReflections();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openLoginQr() {
    qrPreviousFocus = document.activeElement;
    document.getElementById("login-qr-modal").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("close-login-qr").focus();
  }

  function closeLoginQr() {
    document.getElementById("login-qr-modal").hidden = true;
    document.body.classList.remove("modal-open");
    if (qrPreviousFocus && typeof qrPreviousFocus.focus === "function") qrPreviousFocus.focus();
  }

  document.getElementById("open-login-qr").addEventListener("click", openLoginQr);
  document.getElementById("close-login-qr").addEventListener("click", closeLoginQr);
  document.getElementById("login-qr-modal").addEventListener("click", function (event) {
    if (event.target === this) closeLoginQr();
  });
  document.getElementById("copy-login-qr").addEventListener("click", function () {
    var button = this;
    if (!navigator.clipboard || !("ClipboardItem" in window)) {
      showToast("이 브라우저에서는 이미지 복사를 지원하지 않습니다. QR 다운로드를 이용해 주세요.");
      return;
    }
    button.disabled = true;
    button.textContent = "이미지 복사 중…";
    window.fetch("./login-qr-large.png").then(function (response) {
      if (!response.ok) throw new Error("QR 이미지를 불러오지 못했습니다.");
      return response.blob();
    }).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }).then(function () {
      showToast("QR 이미지를 클립보드에 복사했습니다.");
    }).catch(function () {
      showToast("이미지 복사가 차단되었습니다. QR 다운로드를 이용해 주세요.");
    }).finally(function () {
      button.disabled = false;
      button.textContent = "▣ 이미지 복사";
    });
  });

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
      showToast(currentUser.class_number + "반 생태월드에 입장했습니다.");
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
        (currentUser && observation.student_id === currentUser.id ? '<button class="secondary-button inspector-edit-button" type="button" data-edit-observation="' + escapeHtml(observation.id) + '">✎ 내가 등록한 발견 수정</button>' : '') +
      '</div>';
  }

  function openObservationEditor(observation) {
    if (!currentUser || observation.student_id !== currentUser.id) return;
    editingObservation = observation;
    editLocation = { lat: Number(observation.latitude), lng: Number(observation.longitude), name: observation.place_name };
    document.getElementById("observation-edit-photo-preview").src = observation.photo_url;
    document.getElementById("observation-edit-photo").value = "";
    document.getElementById("observation-edit-category").value = observation.category;
    document.getElementById("observation-edit-species").value = observation.species_name;
    document.getElementById("observation-edit-scientific").value = observation.scientific_name || "";
    document.getElementById("observation-edit-place").value = observation.place_name;
    document.getElementById("observation-edit-features").value = observation.features || "";
    document.getElementById("observation-edit-reason").value = observation.identification_reason || "";
    document.getElementById("observation-edit-source").value = observation.source || "";
    document.getElementById("observation-edit-modal").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("observation-edit-species").focus();
  }

  function closeObservationEditor() {
    document.getElementById("observation-edit-modal").hidden = true;
    document.body.classList.remove("modal-open");
    document.getElementById("observation-edit-form").reset();
    editingObservation = null;
    editLocation = null;
  }

  document.getElementById("observation-edit-photo").addEventListener("change", function () {
    var file = this.files && this.files[0];
    if (!file) return;
    fileAsDataUrl(file).then(function (url) {
      if (editingObservation) document.getElementById("observation-edit-photo-preview").src = url;
    }).catch(function (error) { showToast(error.message); });
  });

  document.getElementById("map-inspector").addEventListener("click", function (event) {
    var button = event.target.closest("[data-edit-observation]");
    if (!button) return;
    var observation = observations.find(function (item) { return item.id === button.dataset.editObservation; });
    if (observation) openObservationEditor(observation);
  });
  document.getElementById("close-observation-edit").addEventListener("click", closeObservationEditor);
  document.getElementById("cancel-observation-edit").addEventListener("click", closeObservationEditor);
  document.getElementById("observation-edit-modal").addEventListener("click", function (event) {
    if (event.target === this) closeObservationEditor();
  });
  document.getElementById("observation-edit-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!editingObservation || !editLocation) return;
    var id = editingObservation.id;
    var form = new FormData();
    form.append("latitude", editLocation.lat);
    form.append("longitude", editLocation.lng);
    form.append("place_name", editLocation.name);
    form.append("category", document.getElementById("observation-edit-category").value);
    form.append("species_name", document.getElementById("observation-edit-species").value.trim());
    form.append("scientific_name", document.getElementById("observation-edit-scientific").value.trim());
    form.append("features", document.getElementById("observation-edit-features").value.trim());
    form.append("identification_reason", document.getElementById("observation-edit-reason").value.trim());
    form.append("source", document.getElementById("observation-edit-source").value.trim());
    var photo = document.getElementById("observation-edit-photo").files[0];
    if (photo) form.append("photo", photo, photo.name);
    var button = document.getElementById("save-observation-edit");
    button.disabled = true;
    button.textContent = "저장 중…";
    api("observations/" + encodeURIComponent(id), { method: "PATCH", body: form }).then(function (result) {
      var index = observations.findIndex(function (item) { return item.id === id; });
      if (index >= 0) observations[index] = result.observation;
      closeObservationEditor();
      loadStudentData().then(function () { renderObservationInspector(result.observation); });
      showToast("발견 기록을 수정하고 Google Sheets 동기화 대기열에 저장했습니다.");
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "수정 내용 저장";
    });
  });

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
    return Promise.all([api("observations"), api("guides")]).then(function (results) {
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

  function reflectionValues() {
    return {
      memorable_species: document.getElementById("reflection-memorable").value.trim(),
      contribution: document.getElementById("reflection-contribution").value.trim(),
      problem_solving: document.getElementById("reflection-problem").value.trim(),
      ecological_learning: document.getElementById("reflection-learning").value.trim(),
      perspective_change: document.getElementById("reflection-change").value.trim(),
      further_question: document.getElementById("reflection-question").value.trim(),
      free_reflection: document.getElementById("reflection-free").value.trim()
    };
  }

  function renderReflection(result) {
    currentReflection = result.reflection || null;
    var data = currentReflection || {};
    document.getElementById("reflection-memorable").value = data.memorable_species || "";
    document.getElementById("reflection-contribution").value = data.contribution || "";
    document.getElementById("reflection-problem").value = data.problem_solving || "";
    document.getElementById("reflection-learning").value = data.ecological_learning || "";
    document.getElementById("reflection-change").value = data.perspective_change || "";
    document.getElementById("reflection-question").value = data.further_question || "";
    document.getElementById("reflection-free").value = data.free_reflection || "";
    document.getElementById("reflection-guide-count").textContent = "완성 도감 " + Number(result.guide_count || 0) + "개";
    var submitted = data.status === "submitted";
    var locked = submitted && !result.allow_edits_after_submit;
    var status = document.getElementById("reflection-status");
    status.textContent = submitted ? "최종 제출 완료" : data.status === "draft" ? "임시 저장" : "미작성";
    status.className = "reflection-status " + (submitted ? "submitted" : data.status === "draft" ? "draft" : "");
    document.getElementById("reflection-edit-notice").textContent = submitted
      ? locked ? "최종 제출이 완료되었습니다. 수정이 필요하면 담당 선생님께 요청하세요." : "선생님이 수정을 허용했습니다. 수정 후 다시 최종 제출하세요."
      : "최종 제출 후에는 교사의 허용이 있어야 수정할 수 있습니다.";
    document.querySelectorAll("#reflection-form textarea").forEach(function (field) { field.disabled = locked; });
    document.getElementById("save-reflection-draft").disabled = locked;
    document.getElementById("submit-reflection").disabled = locked;
    document.getElementById("submit-reflection").textContent = locked ? "최종 제출 완료" : submitted ? "수정 내용 재제출" : "최종 제출";
    document.getElementById("reflection-saved-at").textContent = data.updated_at ? "마지막 저장: " + formatDate(data.updated_at) : "아직 저장하지 않았습니다.";
  }

  function loadReflection() {
    if (!currentUser || currentUser.role !== "student") return;
    api("reflection").then(renderReflection).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  function saveReflection(status) {
    var draftButton = document.getElementById("save-reflection-draft");
    var submitButton = document.getElementById("submit-reflection");
    var button = status === "submitted" ? submitButton : draftButton;
    var oldText = button.textContent;
    button.disabled = true;
    button.textContent = "저장 중…";
    api("reflection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign(reflectionValues(), { status: status }))
    }).then(function (result) {
      renderReflection({ reflection: result.reflection, guide_count: result.reflection.guide_count, allow_edits_after_submit: result.allow_edits_after_submit });
      showToast(status === "submitted" ? "소감문을 최종 제출했습니다." : "소감문을 임시 저장했습니다.");
    }).catch(function (error) {
      showToast(error.message);
      button.disabled = false;
      button.textContent = oldText;
    });
  }

  document.getElementById("save-reflection-draft").addEventListener("click", function () { saveReflection("draft"); });
  document.getElementById("reflection-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!window.confirm("소감문 내용을 확인했나요? 최종 제출 후에는 선생님이 허용해야 수정할 수 있습니다.")) return;
    saveReflection("submitted");
  });

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
    activeGuideIndex = index;
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
      '<header class="field-guide-card-head"><div><span class="pixel-label">생태월드 FIELD CARD</span><h2 id="guide-card-title">' + escapeHtml(guide.species_name) + '</h2><p>' + escapeHtml(guide.scientific_name || "학명 미기록") + '</p></div><div class="field-guide-number"><small>ARCHIVE</small><b>NO. ' + String(index + 1).padStart(3, "0") + '</b></div></header>' +
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
    activeGuideIndex = -1;
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
  document.getElementById("edit-guide-from-card").addEventListener("click", function () {
    var guide = guides[activeGuideIndex];
    var observation = guide && observations.find(function (item) { return item.id === guide.observation_id; });
    if (!observation) { showToast("연결된 관찰 기록을 찾을 수 없습니다."); return; }
    closeGuideCard();
    openGuideEditor(observation);
  });
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
    var currentPickerLocation = pickerTarget === "edit" ? editLocation : selectedLocation;
    pendingLocation = currentPickerLocation ? { lat: currentPickerLocation.lat, lng: currentPickerLocation.lng } : null;
    document.getElementById("specific-location-name").value = currentPickerLocation ? currentPickerLocation.name : "";
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
    if (pickerTarget === "edit" && editingObservation) {
      document.getElementById("observation-edit-modal").hidden = false;
    } else {
      document.body.classList.remove("modal-open");
    }
    pickerTarget = "discover";
    if (pickerPreviousFocus && typeof pickerPreviousFocus.focus === "function") pickerPreviousFocus.focus();
  }

  document.getElementById("open-location-picker").addEventListener("click", function () { pickerTarget = "discover"; openLocationPicker(); });
  document.getElementById("observation-location").addEventListener("click", function () { pickerTarget = "discover"; openLocationPicker(); });
  document.getElementById("observation-edit-pick-location").addEventListener("click", function () {
    pickerTarget = "edit";
    document.getElementById("observation-edit-modal").hidden = true;
    openLocationPicker();
  });
  document.getElementById("close-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("cancel-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("location-picker-modal").addEventListener("click", function (event) {
    if (event.target === this) closeLocationPicker();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!document.getElementById("login-qr-modal").hidden) closeLoginQr();
    else if (!document.getElementById("guide-card-modal").hidden) closeGuideCard();
    else if (!document.getElementById("guide-editor-modal").hidden) closeGuideEditor();
    else if (!document.getElementById("location-picker-modal").hidden) closeLocationPicker();
    else if (!document.getElementById("observation-edit-modal").hidden) closeObservationEditor();
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
    if (pickerTarget === "edit") {
      editLocation = { lat: pendingLocation.lat, lng: pendingLocation.lng, name: name };
      document.getElementById("observation-edit-place").value = name;
      closeLocationPicker();
      showToast("수정할 발견 위치를 선택했습니다.");
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
        '<div class="candidate-photo"><span class="candidate-photo-placeholder"><b>' + item.icon + '</b><small>대표 사진 검색 중</small></span><img data-candidate-image="' + index + '" alt="' + escapeHtml(item.name) + ' 대표 사진" loading="eager" /></div>' +
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
      fallbackImageUrl: photo.square_url || photo.url || "",
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
    }).catch(function () { return findLicensedObservationPhoto(scientificName); });
    return candidatePhotoCache[scientificName];
  }

  function loadCandidatePhotos(items) {
    items.forEach(function (item, index) {
      if (/^(Taxon incertae sedis|Unidentified organism|Manual identification)$/i.test(item.scientific)) return;
      findLicensedTaxonPhoto(item.scientific).then(function (photo) {
        if (photo) return photo;
        var relatedTaxon = item.scientific.split(/\s+/)[0];
        return relatedTaxon ? findLicensedObservationPhoto(relatedTaxon) : null;
      }).then(function (photo) {
        if (!photo) return;
        var card = document.querySelector('.candidate-card[data-candidate-index="' + index + '"]');
        if (!card || card.dataset.scientific !== item.scientific) return;
        var image = card.querySelector('[data-candidate-image="' + index + '"]');
        var credit = card.querySelector('[data-candidate-credit="' + index + '"]');
        if (!image || !credit) return;
        image.addEventListener("load", function () {
          image.classList.add("loaded");
          var placeholder = image.parentElement.querySelector(".candidate-photo-placeholder");
          if (placeholder) placeholder.hidden = true;
        });
        image.addEventListener("error", function () {
          if (photo.fallbackImageUrl && image.src !== photo.fallbackImageUrl && !image.dataset.fallbackTried) {
            image.dataset.fallbackTried = "true";
            image.src = photo.fallbackImageUrl;
            return;
          }
          credit.hidden = true;
          var placeholder = image.parentElement.querySelector(".candidate-photo-placeholder");
          if (placeholder) placeholder.innerHTML = '<b>' + escapeHtml(item.icon) + '</b><small>사진을 다시 불러와 주세요</small>';
        });
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

  function parseCsvRows(text) {
    var rows = [];
    var row = [];
    var value = "";
    var quoted = false;
    for (var index = 0; index < text.length; index += 1) {
      var character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          value += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(value);
        value = "";
      } else if (character === "\n") {
        row.push(value.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += character;
      }
    }
    if (quoted) throw new Error("CSV의 따옴표가 올바르게 닫히지 않았습니다.");
    if (value || row.length) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter(function (item) { return item.some(function (cell) { return String(cell).trim(); }); });
  }

  function normalizeCsvHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function findCsvColumn(headers, aliases, required) {
    var index = headers.findIndex(function (header) { return aliases.includes(header); });
    if (required && index < 0) throw new Error(aliases[0] + " 열을 찾을 수 없습니다.");
    return index;
  }

  function findRosterHeaderRow(rows) {
    var numberAliases = ["번호", "출석번호", "순번", "학번", "number", "studentnumber"];
    var nameAliases = ["이름", "성명", "학생명", "학생이름", "학생성명", "name", "studentname"];
    for (var index = 0; index < Math.min(rows.length, 30); index += 1) {
      var headers = rows[index].map(normalizeCsvHeader);
      if (headers.some(function (header) { return numberAliases.includes(header); }) && headers.some(function (header) { return nameAliases.includes(header); })) return index;
    }
    return -1;
  }

  function csvInteger(value, mode) {
    var raw = String(value || "").trim();
    var classMatch = raw.match(/(\d+)\s*반/);
    if (mode === "class" && classMatch) return String(Number(classMatch[1]));
    if (mode === "class" && /^\d+\s*(?:-|학년)\s*\d+$/.test(raw)) return String(Number(raw.match(/(\d+)$/)[1]));
    var match = raw.match(/\d+/);
    return match ? String(Number(match[0])) : raw;
  }

  function parseRosterRows(rows, defaultClass, sourceLabel) {
    rows = rows.filter(function (item) { return item.some(function (cell) { return String(cell).trim(); }); });
    var label = sourceLabel || "명단 파일";
    if (rows.length < 2) throw new Error(label + "에 제목 행과 학생 정보가 필요합니다.");
    var headerRow = findRosterHeaderRow(rows);
    if (headerRow < 0) throw new Error(label + "에서 번호와 이름 열을 찾지 못했습니다.");
    var headers = rows[headerRow].map(normalizeCsvHeader);
    var columns = {
      class_number: findCsvColumn(headers, ["반", "학급", "학급명", "반명", "class", "classnumber"], false),
      student_number: findCsvColumn(headers, ["번호", "출석번호", "순번", "학번", "number", "studentnumber"], true),
      student_name: findCsvColumn(headers, ["이름", "성명", "학생명", "학생이름", "학생성명", "name", "studentname"], true),
      group_number: findCsvColumn(headers, ["모둠", "모둠번호", "조", "group", "groupnumber"], false),
      status: findCsvColumn(headers, ["상태", "status"], false)
    };
    var compoundSchoolNumber = headers[columns.student_number] === "학번";
    if (columns.class_number < 0 && !defaultClass && !compoundSchoolNumber) throw new Error(label + "에 반 열이 없습니다. 학급을 선택하거나 파일명을 `1반.xlsx`처럼 지정해 주세요.");
    var students = rows.slice(headerRow + 1).map(function (row) {
      var rawStudentNumber = String(row[columns.student_number] || "").trim();
      var classNumber = columns.class_number < 0 ? String(defaultClass || "") : csvInteger(row[columns.class_number], "class");
      var studentNumber = csvInteger(rawStudentNumber, "number");
      if (compoundSchoolNumber && /^\d{3,6}$/.test(rawStudentNumber) && Number(rawStudentNumber) > 99) {
        studentNumber = String(Number(rawStudentNumber.slice(-2)));
        if (!classNumber) {
          var classDigits = rawStudentNumber.slice(0, -2);
          if (classDigits.length > 1) classDigits = classDigits.slice(1);
          classNumber = String(Number(classDigits));
        }
      }
      return {
        class_number: classNumber,
        student_number: studentNumber,
        student_name: String(row[columns.student_name] || "").trim(),
        group_number: columns.group_number < 0 ? "" : String(row[columns.group_number] || "").trim(),
        status: columns.status < 0 ? "활동" : String(row[columns.status] || "활동").trim()
      };
    }).filter(function (student) {
      return Number(student.class_number) >= 1 && Number(student.class_number) <= 9 && Number(student.student_number) >= 1 && Number(student.student_number) <= 99 && student.student_name;
    });
    if (!students.length) throw new Error("등록할 학생 정보가 없습니다.");
    if (students.length > 500) throw new Error("한 번에 등록할 수 있는 학생은 최대 500명입니다.");
    return students;
  }

  function parseRosterCsv(text, defaultClass, sourceLabel) {
    return parseRosterRows(parseCsvRows(text), defaultClass, sourceLabel || "CSV");
  }

  function inferClassFromFilename(fileName) {
    var match = String(fileName || "").match(/(?:^|\D)([1-9])\s*반/);
    return match ? match[1] : "";
  }

  function readRosterWorkbook(buffer, file, defaultClass) {
    if (!window.XLSX) throw new Error("엑셀 파일 처리 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
    var workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    var lastError;
    for (var index = 0; index < workbook.SheetNames.length; index += 1) {
      var sheetName = workbook.SheetNames[index];
      var rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false
      });
      try {
        return parseRosterRows(rows, defaultClass, file.name + "의 " + sheetName + " 시트");
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(file.name + "에서 학생 명단을 찾을 수 없습니다.");
  }

  function readRosterFile(file, defaultClass) {
    return file.arrayBuffer().then(function (buffer) {
      var extension = String(file.name || "").split(".").pop().toLowerCase();
      if (extension === "xlsx" || extension === "xls") return readRosterWorkbook(buffer, file, defaultClass);
      var bytes = new Uint8Array(buffer);
      var utf8;
      try {
        utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (_error) {
        utf8 = "";
      }
      var candidates = [];
      if (utf8) candidates.push(utf8);
      try {
        var korean = new TextDecoder("euc-kr").decode(bytes);
        if (!candidates.includes(korean)) candidates.push(korean);
      } catch (_error) {
        // 오래된 브라우저에서는 UTF-8 CSV만 지원합니다.
      }
      var lastError;
      for (var index = 0; index < candidates.length; index += 1) {
        try {
          return parseRosterCsv(candidates[index], defaultClass, file.name);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error(file.name + " 파일을 읽을 수 없습니다.");
    });
  }

  function mergeRosterStudents(groups) {
    var byStudent = new Map();
    groups.forEach(function (students) {
      students.forEach(function (student) {
        var key = student.class_number + ":" + student.student_number;
        var previous = byStudent.get(key);
        var normalizedName = String(student.student_name || "").replace(/\s+/g, "").toLowerCase();
        var previousName = previous ? String(previous.student_name || "").replace(/\s+/g, "").toLowerCase() : "";
        if (previous && previousName !== normalizedName) {
          throw new Error(student.class_number + "반 " + student.student_number + "번 학생 정보가 파일 사이에서 서로 다릅니다.");
        }
        if (!previous) byStudent.set(key, student);
      });
    });
    var students = Array.from(byStudent.values()).sort(function (a, b) {
      return Number(a.class_number) - Number(b.class_number) || Number(a.student_number) - Number(b.student_number);
    });
    if (students.length > 500) throw new Error("한 번에 등록할 수 있는 학생은 최대 500명입니다.");
    return students;
  }

  function prepareRosterFiles() {
    var fileInput = document.getElementById("roster-csv");
    var files = Array.prototype.slice.call(fileInput.files || []);
    pendingRosterRows = [];
    document.getElementById("import-roster").disabled = true;
    if (!files.length) return;
    document.getElementById("roster-file-name").textContent = files.length + "개 파일 읽는 중…";
    var selectedDefaultClass = document.getElementById("roster-default-class").value;
    Promise.all(files.map(function (file) {
      var defaultClass = inferClassFromFilename(file.name) || (files.length === 1 ? selectedDefaultClass : "");
      return readRosterFile(file, defaultClass);
    })).then(function (groups) {
      if (document.getElementById("keep-test-account").checked) {
        groups.push([{
          class_number: "9",
          student_number: "99",
          student_name: "테스트학생",
          group_number: "1",
          status: "활동"
        }]);
      }
      pendingRosterRows = mergeRosterStudents(groups);
      var unassigned = pendingRosterRows.filter(function (student) { return !student.group_number; }).length;
      var classes = Array.from(new Set(pendingRosterRows.map(function (student) { return Number(student.class_number); }))).sort(function (a, b) { return a - b; });
      document.getElementById("roster-file-name").textContent = files.length + "개 파일 · " + classes.map(function (item) { return item + "반"; }).join(", ") + " · " + pendingRosterRows.length + "명 확인";
      if (unassigned) document.getElementById("roster-file-name").textContent += " · 모둠 미배정 " + unassigned + "명";
      document.getElementById("import-roster").disabled = false;
    }).catch(function (error) {
      document.getElementById("roster-file-name").textContent = "엑셀 또는 CSV 형식을 확인해 주세요.";
      showToast(error.message);
    });
  }

  document.getElementById("roster-csv").addEventListener("change", function () {
    prepareRosterFiles();
  });
  document.getElementById("roster-default-class").addEventListener("change", prepareRosterFiles);
  document.getElementById("keep-test-account").addEventListener("change", prepareRosterFiles);

  document.getElementById("import-roster").addEventListener("click", function () {
    if (!pendingRosterRows.length) return;
    var button = this;
    var importedClasses = Array.from(new Set(pendingRosterRows.map(function (student) { return String(student.class_number); })));
    button.disabled = true;
    button.textContent = "명단 등록 중…";
    api("admin/roster/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: pendingRosterRows })
    }).then(function (result) {
      showToast(result.imported + "명을 등록했습니다. 이제 사전 명단 확인 로그인이 적용됩니다.");
      pendingRosterRows = [];
      document.getElementById("roster-csv").value = "";
      document.getElementById("roster-file-name").textContent = "XLSX·XLS·CSV의 반·번호·이름 열을 자동으로 찾습니다.";
      if (importedClasses.length === 1) {
        document.getElementById("roster-class-filter").value = importedClasses[0];
        document.getElementById("team-class-select").value = importedClasses[0];
      }
      loadAdminOverview();
      setTeacherView("roster");
    }).catch(function (error) {
      showToast(error.message);
      button.disabled = false;
    }).finally(function () {
      button.textContent = "명단 등록·갱신";
    });
  });

  document.getElementById("delete-test-account").addEventListener("click", function () {
    if (!window.confirm("9반 99번 테스트학생과 연결된 관찰·도감·사진을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    var button = this;
    button.disabled = true;
    button.textContent = "테스트 자료 삭제 중…";
    api("admin/test-account", { method: "DELETE" }).then(function (result) {
      document.getElementById("keep-test-account").checked = false;
      showToast("테스트 계정과 관찰 " + result.deleted.observations + "건, 도감 " + result.deleted.guides + "개를 삭제했습니다.");
      document.getElementById("roster-csv").value = "";
      pendingRosterRows = [];
      document.getElementById("roster-file-name").textContent = "XLSX·XLS·CSV의 반·번호·이름 열을 자동으로 찾습니다.";
      return Promise.all([loadAdminOverview(), loadRoster()]);
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "테스트 계정·자료 삭제";
    });
  });

  function rosterGroupOptions(selectedGroup) {
    var options = '<option value=""' + (selectedGroup ? ' disabled' : ' selected disabled') + '>미배정</option>';
    for (var group = 1; group <= 20; group += 1) {
      options += '<option value="' + group + '"' + (Number(selectedGroup) === group ? ' selected' : '') + '>' + group + '모둠</option>';
    }
    return options;
  }

  function renderRoster() {
    var body = document.getElementById("roster-list-body");
    if (!rosterStudents.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-message">선택한 범위에 등록된 학생이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rosterStudents.map(function (student) {
      var stateClass = student.registered ? "joined" : "waiting";
      var stateText = student.status !== "active" ? "이용 중지" : student.registered ? "가입 완료" : student.group_number ? "가입 전" : "모둠 미배정";
      return '<tr data-roster-id="' + escapeHtml(student.id) + '">' +
        '<td>' + student.class_number + '반</td><td>' + student.student_number + '번</td><td><b>' + escapeHtml(student.student_name) + '</b></td>' +
        '<td><select class="roster-group-select" data-current-group="' + escapeHtml(student.group_number || "") + '" aria-label="' + escapeHtml(student.student_name) + ' 모둠 선택">' + rosterGroupOptions(student.group_number) + '</select><small class="roster-save-state"></small></td>' +
        '<td><span class="roster-state ' + stateClass + '">' + stateText + '</span></td><td>' + escapeHtml(student.last_login_at ? formatDate(student.last_login_at) : "-") + '</td></tr>';
    }).join("");
  }

  function loadRoster() {
    var classNumber = document.getElementById("roster-class-filter").value;
    return api("admin/roster" + (classNumber ? "?class=" + encodeURIComponent(classNumber) : "")).then(function (result) {
      rosterStudents = result.students || [];
      renderRoster();
      updateTeamAssignmentPreview();
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }


  function parseTeamAssignments(value) {
    var lines = String(value || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) throw new Error("팀별 학생 번호를 입력해 주세요.");
    var seen = new Set();
    var assignments = [];
    lines.forEach(function (line, index) {
      var match = line.match(/^(\d+)\s*(?:팀|모둠|조)?\s*[-:=：]\s*(.+)$/);
      if (!match) throw new Error((index + 1) + "번째 줄을 `1팀 - 1,2,4,6` 형식으로 입력해 주세요.");
      var groupNumber = Number(match[1]);
      if (groupNumber < 1 || groupNumber > 20) throw new Error("팀 번호는 1~20 사이여야 합니다.");
      var numbers = match[2].split(/[,，\s]+/).filter(Boolean).map(Number);
      if (!numbers.length || numbers.some(function (number) { return !Number.isInteger(number) || number < 1 || number > 99; })) {
        throw new Error((index + 1) + "번째 줄의 학생 번호를 확인해 주세요.");
      }
      numbers.forEach(function (studentNumber) {
        if (seen.has(studentNumber)) throw new Error(studentNumber + "번 학생이 두 팀 이상에 중복되었습니다.");
        seen.add(studentNumber);
        assignments.push({ student_number: studentNumber, group_number: groupNumber });
      });
    });
    return assignments;
  }

  function updateTeamAssignmentPreview() {
    var preview = document.getElementById("team-assignment-preview");
    var classNumber = document.getElementById("team-class-select").value;
    var input = document.getElementById("team-assignments").value.trim();
    preview.className = "team-assignment-preview";
    if (!input) {
      preview.textContent = "예: 1팀 - 1,2,4,6 (한 줄에 한 팀씩 입력)";
      return null;
    }
    try {
      var assignments = parseTeamAssignments(input);
      var rosterNumbers = new Set(rosterStudents.map(function (student) { return Number(student.student_number); }));
      var missing = classNumber ? assignments.filter(function (item) { return !rosterNumbers.has(item.student_number); }).map(function (item) { return item.student_number; }) : [];
      if (!classNumber) throw new Error("먼저 학급을 선택해 주세요.");
      if (missing.length) throw new Error(classNumber + "반 명단에 없는 번호: " + missing.join(", ") + "번");
      var unlisted = rosterStudents.filter(function (student) { return !assignments.some(function (item) { return item.student_number === Number(student.student_number); }); }).length;
      preview.textContent = assignments.length + "명 배정 준비 완료" + (unlisted ? " · 미기재 " + unlisted + "명은 기존 팀 유지" : " · 학급 전원 포함");
      preview.classList.add("ready");
      return assignments;
    } catch (error) {
      preview.textContent = error.message;
      preview.classList.add("error");
      return null;
    }
  }

  document.getElementById("team-class-select").addEventListener("change", function () {
    document.getElementById("roster-class-filter").value = this.value;
    loadRoster();
  });
  document.getElementById("team-assignments").addEventListener("input", updateTeamAssignmentPreview);
  document.getElementById("save-team-assignments").addEventListener("click", function () {
    var classNumber = document.getElementById("team-class-select").value;
    var assignments = updateTeamAssignmentPreview();
    if (!assignments) return;
    var button = this;
    button.disabled = true;
    button.textContent = "팀 배정 저장 중…";
    api("admin/roster/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_number: classNumber, assignments: assignments })
    }).then(function (result) {
      showToast(result.class_number + "반 " + result.updated + "명의 팀을 저장했습니다.");
      return Promise.all([loadRoster(), loadAdminOverview()]);
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = "팀 배정 저장";
    });
  });

  document.getElementById("roster-class-filter").addEventListener("change", function () {
    document.getElementById("team-class-select").value = this.value;
    loadRoster();
  });
  document.getElementById("roster-list-body").addEventListener("change", function (event) {
    var select = event.target.closest(".roster-group-select");
    if (!select || !select.value) return;
    var row = select.closest("[data-roster-id]");
    var saveState = row.querySelector(".roster-save-state");
    var previousGroup = select.dataset.currentGroup;
    select.disabled = true;
    saveState.textContent = "저장 중…";
    api("admin/roster/" + encodeURIComponent(row.dataset.rosterId) + "/group", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_number: select.value })
    }).then(function () {
      select.dataset.currentGroup = select.value;
      saveState.textContent = "저장 완료";
      var student = rosterStudents.find(function (item) { return item.id === row.dataset.rosterId; });
      if (student) student.group_number = Number(select.value);
      window.setTimeout(function () { saveState.textContent = ""; }, 1600);
      loadAdminOverview();
    }).catch(function (error) {
      select.value = previousGroup;
      saveState.textContent = "저장 실패";
      showToast(error.message);
    }).finally(function () {
      select.disabled = false;
    });
  });

  function adminObservationFilters(prefix) {
    var classSelect = document.getElementById(prefix + "-class");
    var categorySelect = document.getElementById(prefix + "-category");
    var classValue = classSelect ? classSelect.value : "all";
    var categoryValue = categorySelect ? categorySelect.value : "all";
    return adminObservations.filter(function (item) {
      return (classValue === "all" || Number(item.class_number) === Number(classValue)) &&
        (categoryValue === "all" || item.category === categoryValue);
    });
  }

  function loadAdminObservations(showMap) {
    api("observations").then(function (result) {
      adminObservations = result.observations || [];
      renderAdminObservationList();
      renderAdminMap();
      if (showMap) window.setTimeout(ensureAdminMap, 0);
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  function adminObservationCard(item, index, compact) {
    return '<button class="admin-record-card' + (compact ? ' compact' : '') + '" type="button" data-admin-observation="' + index + '">' +
      '<img src="' + escapeHtml(item.photo_url) + '" alt="' + escapeHtml(item.species_name) + ' 대표 사진" loading="lazy" />' +
      '<span class="admin-record-body"><span class="type-chip">' + escapeHtml(categoryLabel(item.category)) + '</span><b>' + escapeHtml(item.species_name) + '</b>' +
      '<small>' + escapeHtml(item.class_number + '반 ' + item.group_number + '모둠 · ' + item.student_name) + '</small>' +
      '<small>⌖ ' + escapeHtml(item.place_name) + ' · ' + escapeHtml(formatDate(item.created_at)) + '</small></span></button>';
  }

  function renderAdminObservationList() {
    var list = document.getElementById("admin-observation-list");
    if (!list) return;
    var filtered = adminObservationFilters("admin-observation");
    document.getElementById("admin-observation-result").textContent = "총 " + filtered.length + "건";
    list.innerHTML = filtered.length ? filtered.map(function (item) {
      return adminObservationCard(item, adminObservations.indexOf(item), false);
    }).join("") : '<p class="empty-message">조건에 맞는 관찰 기록이 없습니다.</p>';
  }

  function ensureAdminMap() {
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      document.getElementById("admin-kakao-map").innerHTML = '<p class="empty-message">카카오맵을 불러오지 못했습니다. 카카오 개발자 도메인 설정을 확인해 주세요.</p>';
      return;
    }
    window.kakao.maps.load(function () {
      var container = document.getElementById("admin-kakao-map");
      if (!container || document.getElementById("teacher-view-map").hidden) return;
      if (!adminMap) {
        adminMap = new window.kakao.maps.Map(container, {
          center: new window.kakao.maps.LatLng(schoolPosition.lat, schoolPosition.lng),
          level: 4
        });
        adminMap.addControl(new window.kakao.maps.MapTypeControl(), window.kakao.maps.ControlPosition.TOPRIGHT);
        adminMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);
        adminMapClusterer = new window.kakao.maps.MarkerClusterer({ map: adminMap, averageCenter: true, minLevel: 5 });
      }
      adminMap.relayout();
      renderAdminMap();
    });
  }

  function renderAdminMap() {
    var filtered = adminObservationFilters("admin-map");
    var mapList = document.getElementById("admin-map-list");
    if (!mapList) return;
    document.getElementById("admin-map-count").textContent = filtered.length + "건";
    mapList.innerHTML = filtered.length ? filtered.map(function (item) {
      return adminObservationCard(item, adminObservations.indexOf(item), true);
    }).join("") : '<p class="empty-message">조건에 맞는 관찰이 없습니다.</p>';
    if (!adminMap) return;
    if (adminMapClusterer) adminMapClusterer.clear();
    adminMapMarkers.forEach(function (marker) { marker.setMap(null); });
    adminMapMarkers = filtered.map(function (item) {
      var marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(Number(item.latitude), Number(item.longitude)),
        title: item.species_name
      });
      window.kakao.maps.event.addListener(marker, "click", function () { openAdminObservation(item); });
      return marker;
    });
    if (adminMapClusterer) adminMapClusterer.addMarkers(adminMapMarkers);
    if (filtered.length === 1) {
      adminMap.setCenter(new window.kakao.maps.LatLng(Number(filtered[0].latitude), Number(filtered[0].longitude)));
      adminMap.setLevel(3);
    } else {
      adminMap.setCenter(new window.kakao.maps.LatLng(schoolPosition.lat, schoolPosition.lng));
      adminMap.setLevel(4);
    }
  }

  function openAdminRecord(title, subtitle, html) {
    adminRecordPreviousFocus = document.activeElement;
    document.getElementById("admin-record-title").textContent = title;
    document.getElementById("admin-record-subtitle").textContent = subtitle;
    document.getElementById("admin-record-detail").innerHTML = html;
    document.getElementById("admin-record-modal").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("close-admin-record").focus();
  }

  function openAdminObservation(item) {
    var mapUrl = "https://map.kakao.com/link/map/" + encodeURIComponent(item.place_name) + "," + item.latitude + "," + item.longitude;
    openAdminRecord(item.species_name, item.class_number + "반 " + item.group_number + "모둠 · " + item.student_name,
      '<img class="admin-detail-photo" src="' + escapeHtml(item.photo_url) + '" alt="' + escapeHtml(item.species_name) + ' 대표 사진" />' +
      '<div class="admin-detail-tags"><span>' + escapeHtml(categoryLabel(item.category)) + '</span><span>' + escapeHtml(item.identification_status || "학생 동정") + '</span><span>' + escapeHtml(item.review_status || "정상") + '</span></div>' +
      '<dl><dt>학명</dt><dd><i>' + escapeHtml(item.scientific_name || "미기록") + '</i></dd><dt>발견 장소</dt><dd>' + escapeHtml(item.place_name) + ' <a href="' + escapeHtml(mapUrl) + '" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a></dd><dt>관찰 특징</dt><dd>' + escapeHtml(item.features || "미기록") + '</dd><dt>동정 근거</dt><dd>' + escapeHtml(item.identification_reason || "미기록") + '</dd><dt>참고 자료</dt><dd>' + escapeHtml(item.source || "미기록") + '</dd><dt>등록일</dt><dd>' + escapeHtml(formatDate(item.created_at)) + '</dd></dl>');
  }

  function loadAdminGuides() {
    api("admin/guides").then(function (result) {
      adminGuides = result.guides || [];
      renderAdminGuides();
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  function renderAdminGuides() {
    var classValue = document.getElementById("admin-guide-class").value;
    var filtered = adminGuides.filter(function (item) { return classValue === "all" || Number(item.class_number) === Number(classValue); });
    document.getElementById("admin-guide-result").textContent = "총 " + filtered.length + "개";
    document.getElementById("admin-guide-list").innerHTML = filtered.length ? filtered.map(function (item) {
      var index = adminGuides.indexOf(item);
      return '<button class="admin-record-card guide" type="button" data-admin-guide="' + index + '"><img src="' + escapeHtml(item.photo_url) + '" alt="' + escapeHtml(item.species_name) + ' 대표 사진" loading="lazy" /><span class="admin-record-body"><span class="type-chip">' + escapeHtml(categoryLabel(item.category)) + '</span><b>' + escapeHtml(item.species_name) + '</b><small>' + escapeHtml(item.class_number + '반 ' + item.student_number + '번 ' + item.student_name) + '</small><small>' + escapeHtml(item.status + ' · ' + formatDate(item.updated_at)) + '</small></span></button>';
    }).join("") : '<p class="empty-message">조건에 맞는 개인 도감이 없습니다.</p>';
  }

  function openAdminGuide(item) {
    var sourceUrl = safeExternalUrl(item.source);
    var source = sourceUrl ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.source) + '</a>' : escapeHtml(item.source || "미기록");
    openAdminRecord(item.species_name, item.class_number + "반 " + item.student_number + "번 " + item.student_name,
      '<img class="admin-detail-photo" src="' + escapeHtml(item.photo_url) + '" alt="' + escapeHtml(item.species_name) + ' 대표 사진" />' +
      '<div class="admin-detail-tags"><span>' + escapeHtml(categoryLabel(item.category)) + '</span><span>' + escapeHtml(item.status) + '</span></div>' +
      '<dl><dt>학명</dt><dd><i>' + escapeHtml(item.scientific_name || "미기록") + '</i></dd><dt>발견 장소</dt><dd>' + escapeHtml(item.place_name) + '</dd><dt>서식지</dt><dd>' + escapeHtml(item.habitat) + '</dd><dt>주요 특징</dt><dd>' + escapeHtml(item.key_features) + '</dd><dt>생태계 역할</dt><dd>' + escapeHtml(item.ecological_role) + '</dd><dt>조사 보고서</dt><dd>' + escapeHtml(item.report) + '</dd><dt>참고 자료</dt><dd>' + source + '</dd><dt>수정일</dt><dd>' + escapeHtml(formatDate(item.updated_at)) + '</dd></dl>');
  }

  function reflectionStatusLabel(status) {
    return status === "submitted" ? "최종 제출" : status === "draft" ? "임시 저장" : "미작성";
  }

  function reflectionSyncLabel(status) {
    return status === "synced" ? "동기화 완료" : status === "pending" ? "전송 대기" : status === "failed" ? "동기화 실패" : "저장 전";
  }

  function loadAdminReflections() {
    api("admin/reflections").then(function (result) {
      adminReflections = result.reflections || [];
      var toggle = document.getElementById("allow-reflection-edits");
      toggle.checked = Boolean(result.allow_edits_after_submit);
      document.getElementById("allow-reflection-label").textContent = toggle.checked ? "수정 허용 중" : "허용 안 함";
      renderAdminReflections();
    }).catch(function (error) {
      if (error.status === 401) showLogin();
      showToast(error.message);
    });
  }

  function renderAdminReflections() {
    var classValue = document.getElementById("admin-reflection-class").value;
    var statusValue = document.getElementById("admin-reflection-status").value;
    var filtered = adminReflections.filter(function (item) {
      return (classValue === "all" || Number(item.class_number) === Number(classValue)) &&
        (statusValue === "all" || item.reflection_status === statusValue);
    });
    var submitted = adminReflections.filter(function (item) { return item.reflection_status === "submitted"; }).length;
    var draft = adminReflections.filter(function (item) { return item.reflection_status === "draft"; }).length;
    document.getElementById("admin-reflection-result").textContent = "총 " + filtered.length + "명";
    document.getElementById("admin-reflection-summary").textContent = "최종 제출 " + submitted + "명 · 임시 저장 " + draft + "명 · 미작성 " + (adminReflections.length - submitted - draft) + "명";
    document.getElementById("admin-reflection-list").innerHTML = filtered.length ? filtered.map(function (item) {
      var index = adminReflections.indexOf(item);
      var canOpen = item.reflection_status !== "not_started";
      return '<tr><td>' + escapeHtml(item.class_number) + '</td><td>' + escapeHtml(item.student_number) + '</td><td><b>' + escapeHtml(item.student_name) + '</b></td><td>' + escapeHtml(item.group_number || "미배정") + '</td><td>' + escapeHtml(item.guide_count) + '개</td><td><span class="reflection-state ' + escapeHtml(item.reflection_status) + '">' + reflectionStatusLabel(item.reflection_status) + '</span></td><td>' + escapeHtml(item.submitted_at ? formatDate(item.submitted_at) : "-") + '</td><td><span class="sync-state ' + escapeHtml(item.sync_status) + '">' + reflectionSyncLabel(item.sync_status) + '</span></td><td>' + (canOpen ? '<button class="table-detail-button" type="button" data-admin-reflection="' + index + '">보기</button>' : '-') + '</td></tr>';
    }).join("") : '<tr><td colspan="9" class="empty-message">조건에 맞는 학생이 없습니다.</td></tr>';
  }

  function openAdminReflection(item) {
    openAdminRecord("탐사 소감문", item.class_number + "반 " + item.student_number + "번 " + item.student_name + " · " + reflectionStatusLabel(item.reflection_status),
      '<div class="admin-detail-tags"><span>완성 도감 ' + escapeHtml(item.guide_count) + '개</span><span>' + reflectionStatusLabel(item.reflection_status) + '</span><span>' + reflectionSyncLabel(item.sync_status) + '</span></div>' +
      '<dl><dt>1. 인상 깊었던 생물</dt><dd>' + escapeHtml(item.memorable_species || "미작성") + '</dd><dt>2. 역할과 기여</dt><dd>' + escapeHtml(item.contribution || "미작성") + '</dd><dt>3. 문제 해결</dt><dd>' + escapeHtml(item.problem_solving || "미작성") + '</dd><dt>4. 생태 지식</dt><dd>' + escapeHtml(item.ecological_learning || "미작성") + '</dd><dt>5. 생각의 변화</dt><dd>' + escapeHtml(item.perspective_change || "미작성") + '</dd><dt>6. 후속 탐구 질문</dt><dd>' + escapeHtml(item.further_question || "미작성") + '</dd><dt>7. 자유 소감</dt><dd>' + escapeHtml(item.free_reflection || "미작성") + '</dd><dt>최종 제출일</dt><dd>' + escapeHtml(item.submitted_at ? formatDate(item.submitted_at) : "미제출") + '</dd></dl>');
  }

  document.getElementById("admin-observation-class").addEventListener("change", renderAdminObservationList);
  document.getElementById("admin-observation-category").addEventListener("change", renderAdminObservationList);
  document.getElementById("admin-map-class").addEventListener("change", renderAdminMap);
  document.getElementById("admin-map-category").addEventListener("change", renderAdminMap);
  document.getElementById("admin-guide-class").addEventListener("change", renderAdminGuides);
  document.getElementById("admin-reflection-class").addEventListener("change", renderAdminReflections);
  document.getElementById("admin-reflection-status").addEventListener("change", renderAdminReflections);
  document.getElementById("allow-reflection-edits").addEventListener("change", function () {
    var toggle = this;
    toggle.disabled = true;
    api("admin/reflections/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_edits_after_submit: toggle.checked })
    }).then(function (result) {
      document.getElementById("allow-reflection-label").textContent = result.allow_edits_after_submit ? "수정 허용 중" : "허용 안 함";
      showToast(result.allow_edits_after_submit ? "최종 제출 후 수정을 허용했습니다." : "최종 제출 후 수정을 잠갔습니다.");
    }).catch(function (error) {
      toggle.checked = !toggle.checked;
      showToast(error.message);
    }).finally(function () { toggle.disabled = false; });
  });
  document.getElementById("teacher-app").addEventListener("click", function (event) {
    var observationCard = event.target.closest("[data-admin-observation]");
    var guideCard = event.target.closest("[data-admin-guide]");
    var reflectionButton = event.target.closest("[data-admin-reflection]");
    if (observationCard && adminObservations[Number(observationCard.dataset.adminObservation)]) openAdminObservation(adminObservations[Number(observationCard.dataset.adminObservation)]);
    if (guideCard && adminGuides[Number(guideCard.dataset.adminGuide)]) openAdminGuide(adminGuides[Number(guideCard.dataset.adminGuide)]);
    if (reflectionButton && adminReflections[Number(reflectionButton.dataset.adminReflection)]) openAdminReflection(adminReflections[Number(reflectionButton.dataset.adminReflection)]);
  });
  document.getElementById("close-admin-record").addEventListener("click", function () {
    document.getElementById("admin-record-modal").hidden = true;
    document.body.classList.remove("modal-open");
    if (adminRecordPreviousFocus) adminRecordPreviousFocus.focus();
  });
  document.getElementById("admin-record-modal").addEventListener("click", function (event) {
    if (event.target === this) document.getElementById("close-admin-record").click();
  });

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
      var rosterStatus = document.getElementById("roster-status");
      rosterStatus.classList.toggle("enabled", Boolean(result.roster_enabled));
      rosterStatus.textContent = result.roster_enabled
        ? "사전 명단 " + result.roster_count + "명 등록 · 모둠 미배정 " + result.unassigned_count + "명"
        : "명단이 비어 있어 현재는 기존 방식으로 로그인합니다.";
      document.getElementById("class-overview").innerHTML = classes.map(function (item) {
        return '<div class="class-cell"><div><b>' + item.class_number + '반</b><span>' + item.students + ' / ' + item.roster + '명</span></div><p>참여 / 명단 · 관찰 ' + item.observations + '건 · 도감 ' + item.guides + '개</p></div>';
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

  document.querySelectorAll("[data-teacher-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!teacherApp.hidden) setTeacherView(button.dataset.teacherView);
    });
  });
  restoreSession();
}());
