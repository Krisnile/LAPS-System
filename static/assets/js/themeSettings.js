$(document).ready(function() {
    $().ready(function() {
        $sidebar = $('.sidebar');
        $navbar = $('.navbar');
        $main_panel = $('.main-panel');

        $full_page = $('.full-page');

        $sidebar_responsive = $('body > .navbar-collapse');
        sidebar_mini_active = true;
        white_color = false;

        window_width = $(window).width();

        fixed_plugin_open = $('.sidebar .sidebar-wrapper .nav li.active a p').html();

        $('.fixed-plugin a').click(function(event) {
            if ($(this).hasClass('switch-trigger')) {
                if (event.stopPropagation) {
                    event.stopPropagation();
                } else if (window.event) {
                    window.event.cancelBubble = true;
                }
            }
        });

        function applySidebarColor(color) {
            if (!color) return;
            if ($sidebar.length !== 0) {
                $sidebar.attr('data', color);
                $sidebar.attr('data-color', color);
                $sidebar.find('.sidebar-wrapper').attr('data', color).attr('data-color', color);
            }
            if ($main_panel.length !== 0) {
                $main_panel.attr('data', color);
            }
            if ($full_page.length !== 0) {
                $full_page.attr('filter-color', color);
            }
            if ($sidebar_responsive.length !== 0) {
                $sidebar_responsive.attr('data', color);
            }
            $('.badge-colors .badge[data-color]')
                .removeClass('active')
                .filter('[data-color="' + color + '"]')
                .addClass('active');
        }

        var saved_sidebar_color = localStorage.getItem('sidebar_color');
        if (saved_sidebar_color && /^(primary|blue|green)$/.test(saved_sidebar_color)) {
            applySidebarColor(saved_sidebar_color);
        }

        $('.badge-colors .badge[data-color]').click(function() {
            var new_color = $(this).data('color');
            if (!new_color) return;
            localStorage.setItem('sidebar_color', new_color);
            applySidebarColor(new_color);
        });

        // 允许点击整行主题项（不仅仅是圆点）
        $('.theme-item').on('click', function() {
            var new_color = $(this).data('color') ||
                $(this).find('.badge[data-color]').data('color');
            if (!new_color) return;
            localStorage.setItem('sidebar_color', new_color);
            applySidebarColor(new_color);

            // 同时更新 html 上的 theme-* class，避免切换页面时闪烁
            var $root = $(document.documentElement);
            $root.removeClass('theme-primary theme-blue theme-green');
            if (new_color === 'blue') $root.addClass('theme-blue');
            else if (new_color === 'green') $root.addClass('theme-green');
            else $root.addClass('theme-primary');
        });

        // Layout mode (left / center / right)，主要用于登录页布局；其他页面可忽略
        function applyLayoutMode(mode) {
            var valid = ['left', 'center', 'right'];
            if (valid.indexOf(mode) === -1) mode = 'left';
            $('body').removeClass('layout-left layout-center layout-wide')
                     .addClass('layout-' + mode);
            $('.layout-item').removeClass('active')
                .filter('[data-layout="' + mode + '"]').addClass('active');
        }

        var saved_layout_mode = localStorage.getItem('layout_mode') || 'left';
        applyLayoutMode(saved_layout_mode);

        $('.layout-item').on('click', function() {
            var mode = $(this).data('layout');
            if (!mode) return;
            localStorage.setItem('layout_mode', mode);
            applyLayoutMode(mode);
        });

        $('.switch-sidebar-mini input').on("switchChange.bootstrapSwitch", function() {
            var $btn = $(this);

            if (sidebar_mini_active == true) {
                $('body').removeClass('sidebar-mini');
                sidebar_mini_active = false;
                blackDashboard.showSidebarMessage('Sidebar mini deactivated...');
            } else {
                $('body').addClass('sidebar-mini');
                sidebar_mini_active = true;
                blackDashboard.showSidebarMessage('Sidebar mini activated...');
            }

            var simulateWindowResize = setInterval(function() {
                window.dispatchEvent(new Event('resize'));
            }, 180);

            setTimeout(function() {
                clearInterval(simulateWindowResize);
            }, 1000);
        });

        $('.switch-change-color input').on("switchChange.bootstrapSwitch", function() {
            if (white_color == true) {
                $('body').addClass('change-background');
                setTimeout(function() {
                    $('body').removeClass('change-background');
                    $('body').removeClass('white-content');
                }, 900);
                white_color = false;
            } else {
                $('body').addClass('change-background');
                setTimeout(function() {
                    $('body').removeClass('change-background');
                    $('body').addClass('white-content');
                }, 900);
                white_color = true;
            }
        });

        $('.light-badge').click(function() {
            $('body').addClass('white-content');
            localStorage.setItem("light_color", "true");
            $('.switch input').prop("checked", false);
        });

        $('.dark-badge').click(function() {
            $('body').removeClass('white-content');
            localStorage.setItem("light_color", "false");
            $('.switch input').prop("checked", true);
        });
    });
});

$(document).ready(function () {
    let light_color = localStorage.getItem("light_color");

    if (light_color === "true") {
        $('body').addClass('white-content');
        $('.switch input').prop("checked", false);
    } else {
        $('.switch input').prop("checked", true);
    }

    $('.switch input').on("change", function () {
        light_color = localStorage.getItem("light_color");

        if (light_color === "true") {
            localStorage.setItem("light_color", "false");

            $('body').addClass('change-background');
            setTimeout(function () {
                $('body').removeClass('change-background');
                $('body').removeClass('white-content');
            }, 400);

        } else {
            localStorage.setItem("light_color", "true");

            $('body').addClass('change-background');
            setTimeout(function () {
                $('body').removeClass('change-background');
                $('body').addClass('white-content');
            }, 400);
        }
    });
});
